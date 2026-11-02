<?php
/**
 * Gladmoment push reminders: lets the bell reach phones when the app is closed.
 *
 * What is stored (in the wp_gladmoment_push table): each phone's push address
 * (endpoint + encryption keys from the browser), the upcoming reminder times
 * (as timestamps), the language and whether "vibrate only" is on.
 * Journal entries are never sent to the server.
 *
 * Messages are encrypted (RFC 8291, aes128gcm) and signed with VAPID (RFC 8292).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GLADMOMENT_PUSH_DB_VERSION', '1' );

function gladmoment_push_table() {
	global $wpdb;
	return $wpdb->prefix . 'gladmoment_push';
}

/** Create the table (safe to call repeatedly). */
function gladmoment_push_install() {
	global $wpdb;
	if ( get_option( 'gladmoment_push_db' ) === GLADMOMENT_PUSH_DB_VERSION ) {
		gladmoment_push_keys();
		return;
	}
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$table   = gladmoment_push_table();
	$charset = $wpdb->get_charset_collate();
	dbDelta(
		"CREATE TABLE {$table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			endpoint_hash char(64) NOT NULL,
			endpoint text NOT NULL,
			p256dh varchar(255) NOT NULL,
			auth varchar(255) NOT NULL,
			times longtext NOT NULL,
			lang varchar(8) NOT NULL DEFAULT 'en',
			quiet tinyint(1) NOT NULL DEFAULT 0,
			updated_at int(10) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (id),
			UNIQUE KEY endpoint_hash (endpoint_hash)
		) {$charset};"
	);
	update_option( 'gladmoment_push_db', GLADMOMENT_PUSH_DB_VERSION );
	gladmoment_push_keys();
}

/* ---------- base64url helpers ---------- */
function gladmoment_b64u_encode( $bin ) {
	return rtrim( strtr( base64_encode( $bin ), '+/', '-_' ), '=' );
}
function gladmoment_b64u_decode( $s ) {
	$s = strtr( (string) $s, '-_', '+/' );
	return base64_decode( $s . str_repeat( '=', ( 4 - strlen( $s ) % 4 ) % 4 ), true );
}

/* ---------- keys ---------- */

/** Create (once) and return the VAPID key pair: array( 'private' => PEM, 'public' => base64url raw point ). */
function gladmoment_push_keys() {
	$keys = get_option( 'gladmoment_vapid' );
	if ( is_array( $keys ) && ! empty( $keys['private'] ) && ! empty( $keys['public'] ) ) {
		return $keys;
	}
	if ( ! function_exists( 'openssl_pkey_new' ) ) {
		return null;
	}
	$key = openssl_pkey_new( array( 'curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC ) );
	if ( ! $key ) {
		return null;
	}
	openssl_pkey_export( $key, $pem );
	$keys = array(
		'private' => $pem,
		'public'  => gladmoment_b64u_encode( gladmoment_ec_raw_public( $key ) ),
	);
	update_option( 'gladmoment_vapid', $keys, false );
	return $keys;
}

/** Uncompressed P-256 public point (0x04 || X || Y) for an OpenSSL EC key. */
function gladmoment_ec_raw_public( $key ) {
	$d = openssl_pkey_get_details( $key );
	return "\x04" . str_pad( $d['ec']['x'], 32, "\0", STR_PAD_LEFT ) . str_pad( $d['ec']['y'], 32, "\0", STR_PAD_LEFT );
}

/** PEM for a raw uncompressed P-256 public point. */
function gladmoment_ec_pem_from_raw( $raw ) {
	$der = hex2bin( '3059301306072a8648ce3d020106082a8648ce3d030107034200' ) . $raw;
	return "-----BEGIN PUBLIC KEY-----\n" . chunk_split( base64_encode( $der ), 64, "\n" ) . "-----END PUBLIC KEY-----\n";
}

/** Convert an OpenSSL DER ECDSA signature to the raw 64-byte R||S form JWT needs. */
function gladmoment_der_to_raw_sig( $der ) {
	$off    = 2;
	$rlen   = ord( $der[ $off + 1 ] );
	$r      = substr( $der, $off + 2, $rlen );
	$off    = $off + 2 + $rlen;
	$slen   = ord( $der[ $off + 1 ] );
	$s      = substr( $der, $off + 2, $slen );
	$r = str_pad( ltrim( $r, "\0" ), 32, "\0", STR_PAD_LEFT );
	$s = str_pad( ltrim( $s, "\0" ), 32, "\0", STR_PAD_LEFT );
	return $r . $s;
}

/* ---------- VAPID (RFC 8292) ---------- */
function gladmoment_vapid_header( $endpoint, $keys, $contact = 'mailto:contact@gemrhythm.com' ) {
	$parts = wp_parse_url( $endpoint );
	$aud   = $parts['scheme'] . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . $parts['port'] : '' );
	$head  = gladmoment_b64u_encode( wp_json_encode( array( 'typ' => 'JWT', 'alg' => 'ES256' ) ) );
	$body  = gladmoment_b64u_encode( wp_json_encode( array( 'aud' => $aud, 'exp' => time() + 12 * HOUR_IN_SECONDS, 'sub' => $contact ) ) );
	$data  = $head . '.' . $body;
	if ( ! openssl_sign( $data, $der, $keys['private'], OPENSSL_ALGO_SHA256 ) ) {
		return null;
	}
	$jwt = $data . '.' . gladmoment_b64u_encode( gladmoment_der_to_raw_sig( $der ) );
	return 'vapid t=' . $jwt . ', k=' . $keys['public'];
}

/* ---------- payload encryption (RFC 8291, aes128gcm) ---------- */
function gladmoment_push_encrypt( $payload, $p256dh_b64u, $auth_b64u, $salt = null, $local = null ) {
	$ua_public = gladmoment_b64u_decode( $p256dh_b64u );
	$auth      = gladmoment_b64u_decode( $auth_b64u );
	if ( strlen( $ua_public ) !== 65 || strlen( $auth ) < 16 ) {
		return null;
	}
	$local = $local ? $local : openssl_pkey_new( array( 'curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC ) );
	$as_public = gladmoment_ec_raw_public( $local );
	$peer      = openssl_pkey_get_public( gladmoment_ec_pem_from_raw( $ua_public ) );
	$secret    = openssl_pkey_derive( $peer, $local, 32 );
	if ( false === $secret ) {
		return null;
	}
	$salt     = $salt ? $salt : random_bytes( 16 );
	$prk_key  = hash_hmac( 'sha256', $secret, $auth, true );
	$key_info = "WebPush: info\0" . $ua_public . $as_public;
	$ikm      = hash_hmac( 'sha256', $key_info . "\x01", $prk_key, true );
	$prk      = hash_hmac( 'sha256', $ikm, $salt, true );
	$cek      = substr( hash_hmac( 'sha256', "Content-Encoding: aes128gcm\0\x01", $prk, true ), 0, 16 );
	$nonce    = substr( hash_hmac( 'sha256', "Content-Encoding: nonce\0\x01", $prk, true ), 0, 12 );
	$tag      = '';
	$cipher   = openssl_encrypt( $payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag );
	if ( false === $cipher ) {
		return null;
	}
	return $salt . pack( 'N', 4096 ) . chr( 65 ) . $as_public . $cipher . $tag;
}

/* ---------- which push services we will talk to (prevents abuse of the server) ---------- */
function gladmoment_push_endpoint_allowed( $endpoint ) {
	$parts = wp_parse_url( $endpoint );
	if ( empty( $parts['scheme'] ) || 'https' !== $parts['scheme'] || empty( $parts['host'] ) ) {
		return false;
	}
	$host  = strtolower( $parts['host'] );
	$allow = array( 'fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'push.apple.com', 'notify.windows.com', 'push.services.mozilla.com' );
	foreach ( $allow as $suffix ) {
		if ( $host === $suffix || substr( $host, -strlen( '.' . $suffix ) ) === '.' . $suffix ) {
			return true;
		}
	}
	return (bool) apply_filters( 'gladmoment_push_endpoint_allowed', false, $endpoint );
}

/* ---------- REST API: /?rest_route=/gladmoment/v1/... ---------- */
add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'gladmoment/v1',
			'/push/key',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => function () {
					$keys = gladmoment_push_keys();
					if ( ! $keys ) {
						return new WP_Error( 'gladmoment_no_keys', 'Push is not available on this server.', array( 'status' => 503 ) );
					}
					return array( 'publicKey' => $keys['public'] );
				},
			)
		);
		register_rest_route(
			'gladmoment/v1',
			'/push/subscribe',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => 'gladmoment_push_rest_subscribe',
			)
		);
		register_rest_route(
			'gladmoment/v1',
			'/push/unsubscribe',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => 'gladmoment_push_rest_unsubscribe',
			)
		);
		register_rest_route(
			'gladmoment/v1',
			'/push/run',
			array(
				'methods'             => array( 'GET', 'POST' ),
				'permission_callback' => '__return_true',
				'callback'            => function ( $request ) {
					$secret = (string) get_option( 'gladmoment_cron_secret' );
					if ( ! $secret || ! hash_equals( $secret, (string) $request->get_param( 'key' ) ) ) {
						return new WP_Error( 'gladmoment_forbidden', 'Wrong key.', array( 'status' => 403 ) );
					}
					return gladmoment_push_send_due();
				},
			)
		);
	}
);

function gladmoment_push_rest_subscribe( $request ) {
	global $wpdb;
	gladmoment_push_install();
	$sub      = (array) $request->get_param( 'subscription' );
	$endpoint = isset( $sub['endpoint'] ) ? (string) $sub['endpoint'] : '';
	$keys     = isset( $sub['keys'] ) ? (array) $sub['keys'] : array();
	if ( ! gladmoment_push_endpoint_allowed( $endpoint ) || empty( $keys['p256dh'] ) || empty( $keys['auth'] ) ) {
		return new WP_Error( 'gladmoment_bad_subscription', 'Not a valid push subscription.', array( 'status' => 400 ) );
	}
	if ( strlen( gladmoment_b64u_decode( $keys['p256dh'] ) ) !== 65 ) {
		return new WP_Error( 'gladmoment_bad_subscription', 'Not a valid push subscription.', array( 'status' => 400 ) );
	}
	$now   = time();
	$times = array();
	foreach ( (array) $request->get_param( 'times' ) as $t ) {
		$t = (int) $t;
		if ( $t > $now - 60 && $t < $now + 40 * DAY_IN_SECONDS ) {
			$times[] = $t;
		}
	}
	$times = array_slice( array_values( array_unique( $times ) ), 0, 1500 );
	sort( $times );
	$hash = hash( 'sha256', $endpoint );
	$row  = array(
		'endpoint_hash' => $hash,
		'endpoint'      => $endpoint,
		'p256dh'        => substr( (string) $keys['p256dh'], 0, 255 ),
		'auth'          => substr( (string) $keys['auth'], 0, 255 ),
		'times'         => wp_json_encode( $times ),
		'lang'          => 'fr' === $request->get_param( 'lang' ) ? 'fr' : 'en',
		'quiet'         => $request->get_param( 'quiet' ) ? 1 : 0,
		'updated_at'    => $now,
	);
	$table    = gladmoment_push_table();
	$existing = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE endpoint_hash = %s", $hash ) );
	if ( $existing ) {
		$wpdb->update( $table, $row, array( 'id' => $existing ) );
	} else {
		$count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
		if ( $count >= 20000 ) {
			return new WP_Error( 'gladmoment_full', 'Too many subscriptions.', array( 'status' => 503 ) );
		}
		$wpdb->insert( $table, $row );
	}
	return array( 'ok' => true, 'scheduled' => count( $times ) );
}

function gladmoment_push_rest_unsubscribe( $request ) {
	global $wpdb;
	$endpoint = (string) $request->get_param( 'endpoint' );
	if ( $endpoint ) {
		$wpdb->delete( gladmoment_push_table(), array( 'endpoint_hash' => hash( 'sha256', $endpoint ) ) );
	}
	return array( 'ok' => true );
}

/** Messages, in the person's language. */
function gladmoment_push_message( $lang, $quiet ) {
	if ( 'fr' === $lang ) {
		return array(
			'title' => $quiet ? 'Un moment de gratitude en silence 📳' : 'Un petit moment de gratitude 💛',
			'body'  => $quiet ? 'Faites une pause et dites merci en silence, dans votre cœur.' : 'Prenez quelques secondes. Quelle est une chose qui vous remplit de gratitude en ce moment ?',
		);
	}
	return array(
		'title' => $quiet ? 'A quiet gratitude moment 📳' : 'A little gratitude moment 💛',
		'body'  => $quiet ? 'Pause and give thanks silently in your heart.' : 'Take a few seconds. What is one thing you’re grateful for right now?',
	);
}

/** Send one encrypted push. Returns the HTTP status (0 on network error). */
function gladmoment_push_send_one( $row, $payload ) {
	$keys = gladmoment_push_keys();
	if ( ! $keys ) {
		return 0;
	}
	$body = gladmoment_push_encrypt( $payload, $row->p256dh, $row->auth );
	$auth = gladmoment_vapid_header( $row->endpoint, $keys );
	if ( ! $body || ! $auth ) {
		return 0;
	}
	$res = wp_remote_post(
		$row->endpoint,
		array(
			'timeout' => 10,
			'headers' => array(
				'Authorization'    => $auth,
				'Content-Encoding' => 'aes128gcm',
				'Content-Type'     => 'application/octet-stream',
				'TTL'              => '900',
				'Urgency'          => 'high',
			),
			'body'    => $body,
		)
	);
	return is_wp_error( $res ) ? 0 : (int) wp_remote_retrieve_response_code( $res );
}

/**
 * Send every reminder that is due (in the last 15 minutes) and drop past ones.
 * Called every minute by the Hostinger cron job (and by WP-Cron as a backup).
 */
function gladmoment_push_send_due() {
	global $wpdb;
	$table = gladmoment_push_table();
	if ( get_option( 'gladmoment_push_db' ) !== GLADMOMENT_PUSH_DB_VERSION ) {
		return array( 'sent' => 0 );
	}
	$lock = get_transient( 'gladmoment_push_lock' );
	if ( $lock ) {
		return array( 'sent' => 0, 'busy' => true );
	}
	set_transient( 'gladmoment_push_lock', 1, 50 );
	$now     = time();
	$sent    = 0;
	$removed = 0;
	$rows    = $wpdb->get_results( "SELECT * FROM {$table}" );
	foreach ( (array) $rows as $row ) {
		$times = json_decode( $row->times, true );
		$times = is_array( $times ) ? $times : array();
		$due   = array_filter( $times, function ( $t ) use ( $now ) {
			return $t <= $now && $t > $now - 15 * MINUTE_IN_SECONDS;
		} );
		$left  = array_values( array_filter( $times, function ( $t ) use ( $now ) {
			return $t > $now;
		} ) );
		if ( $due ) {
			$msg    = gladmoment_push_message( $row->lang, (bool) $row->quiet );
			$status = gladmoment_push_send_one( $row, wp_json_encode( array_merge( $msg, array( 'quiet' => (bool) $row->quiet, 'url' => './#/home?focus=1' ) ) ) );
			if ( 404 === $status || 410 === $status ) {
				$wpdb->delete( $table, array( 'id' => $row->id ) );
				$removed++;
				continue;
			}
			if ( $status >= 200 && $status < 300 ) {
				$sent++;
			}
		}
		if ( count( $left ) !== count( $times ) ) {
			$wpdb->update( $table, array( 'times' => wp_json_encode( $left ) ), array( 'id' => $row->id ) );
		}
	}
	update_option( 'gladmoment_push_last_run', $now, false );
	delete_transient( 'gladmoment_push_lock' );
	return array( 'sent' => $sent, 'removed' => $removed, 'phones' => count( (array) $rows ) );
}

/* ---------- WP-Cron backup (runs on page visits; the Hostinger cron job is more reliable) ---------- */
add_filter(
	'cron_schedules',
	function ( $s ) {
		$s['gladmoment_minute'] = array( 'interval' => 60, 'display' => 'Every minute (Gladmoment)' );
		return $s;
	}
);
add_action( 'gladmoment_push_tick', 'gladmoment_push_send_due' );
add_action(
	'init',
	function () {
		if ( function_exists( 'wp_next_scheduled' ) && ! wp_next_scheduled( 'gladmoment_push_tick' ) ) {
			wp_schedule_event( time() + 60, 'gladmoment_minute', 'gladmoment_push_tick' );
		}
	}
);

/** Secret for the cron URL. */
function gladmoment_cron_url() {
	$secret = get_option( 'gladmoment_cron_secret' );
	if ( ! $secret ) {
		$secret = wp_generate_password( 32, false );
		update_option( 'gladmoment_cron_secret', $secret, false );
	}
	return add_query_arg( array( 'rest_route' => '/gladmoment/v1/push/run', 'key' => $secret ), home_url( '/' ) );
}

/** Settings → Gladmoment: "Reminders when the app is closed". */
function gladmoment_push_settings_section() {
	global $wpdb;
	echo '<h2>Reminders when the app is closed</h2>';
	if ( ! gladmoment_push_keys() ) {
		echo '<p>⚠️ This server’s PHP can’t create the security keys needed for push reminders (OpenSSL with elliptic curves is missing). Ask Hostinger support to enable the PHP <code>openssl</code> extension.</p>';
		return;
	}
	gladmoment_push_install();
	$table  = gladmoment_push_table();
	$phones = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	$last   = (int) get_option( 'gladmoment_push_last_run' );
	$url    = gladmoment_cron_url();
	echo '<p>Phones signed up for reminders: <strong>' . esc_html( $phones ) . '</strong>. ';
	if ( $last ) {
		$ago = time() - $last;
		echo 'Reminder check last ran ' . esc_html( human_time_diff( $last ) ) . ' ago ' . ( $ago <= 180 ? '✅' : '⚠️ (it should run every minute; set up the cron job below)' ) . '.</p>';
	} else {
		echo 'The reminder check hasn’t run yet. Set up the cron job below.</p>';
	}
	echo '<p><strong>One-time setup in Hostinger</strong> (so the bell rings on time, every minute):</p><ol>';
	echo '<li>hPanel → Websites → gemrhythm.com → <strong>Advanced → Cron Jobs</strong>.</li>';
	echo '<li>Choose <strong>Custom</strong> and paste this command:<br><input type="text" readonly class="large-text code" onclick="this.select()" value="' . esc_attr( 'wget -q -O /dev/null "' . $url . '"' ) . '"></li>';
	echo '<li>Set it to run <strong>every minute</strong> (all five boxes <code>*</code>) and click <strong>Save</strong>.</li></ol>';
	echo '<p class="description">Keep this link private: it only sends reminders that are due, but it shouldn’t be shared. Without the cron job, WordPress still checks for reminders whenever someone visits your site, which may be late.</p>';
}
