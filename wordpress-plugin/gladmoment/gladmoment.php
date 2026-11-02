<?php
/**
 * Plugin Name:       Gladmoment
 * Description:       A gentle gratitude reminder and journal. Installs the Gladmoment app at yoursite.com/gladmoment/ and adds the [gladmoment_landing] and [gladmoment_button] shortcodes.
 * Version:           1.7.1
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Gemrhythm
 * License:           MIT
 * Text Domain:       gladmoment
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GLADMOMENT_VERSION', '1.7.1' );
define( 'GLADMOMENT_SLUG', 'gladmoment' );
define( 'GLADMOMENT_SOURCE', __DIR__ . '/app' );
define( 'GLADMOMENT_MARKER', '.gladmoment-plugin' );

require_once __DIR__ . '/includes/push.php';

/** Folder in the site root where the app is served from. */
function gladmoment_target_dir() {
	return trailingslashit( ABSPATH ) . GLADMOMENT_SLUG;
}

function gladmoment_url() {
	return trailingslashit( home_url( '/' . GLADMOMENT_SLUG ) );
}

/** Copy a folder recursively. Returns true on success. */
function gladmoment_copy_dir( $from, $to ) {
	if ( ! is_dir( $to ) && ! @mkdir( $to, 0755, true ) ) {
		return false;
	}
	$items = scandir( $from );
	if ( false === $items ) {
		return false;
	}
	foreach ( $items as $item ) {
		if ( '.' === $item || '..' === $item ) {
			continue;
		}
		$src = $from . '/' . $item;
		$dst = $to . '/' . $item;
		if ( is_dir( $src ) ) {
			if ( ! gladmoment_copy_dir( $src, $dst ) ) {
				return false;
			}
		} elseif ( ! @copy( $src, $dst ) ) {
			return false;
		}
	}
	return true;
}

/** Delete a folder recursively. */
function gladmoment_delete_dir( $dir ) {
	if ( ! is_dir( $dir ) ) {
		return;
	}
	foreach ( scandir( $dir ) as $item ) {
		if ( '.' === $item || '..' === $item ) {
			continue;
		}
		$path = $dir . '/' . $item;
		is_dir( $path ) && ! is_link( $path ) ? gladmoment_delete_dir( $path ) : @unlink( $path );
	}
	@rmdir( $dir );
}

/** Settings the app reads from config.json: playlist link and pause music. */
function gladmoment_site_config() {
	$tracks = array_values( array_filter( (array) get_option( 'gladmoment_pause_tracks', array() ) ) );
	return array(
		'musicUrl'    => (string) get_option( 'gladmoment_music_url', 'https://gemrhythm.com/playlist-category/relaxation/' ),
		'pauseTracks' => $tracks,
	);
}

/** Write config.json into the installed app folder (when the app is served from there). */
function gladmoment_write_config() {
	$target = gladmoment_target_dir();
	if ( file_exists( $target . '/' . GLADMOMENT_MARKER ) ) {
		@file_put_contents( $target . '/config.json', wp_json_encode( gladmoment_site_config() ) );
	}
}

/** Clear LiteSpeed Cache (common on Hostinger) so visitors don't see an old "page not found". */
function gladmoment_purge_cache() {
	do_action( 'litespeed_purge_all' );
	if ( function_exists( 'wp_cache_flush' ) ) {
		wp_cache_flush();
	}
}

/**
 * Put the app files in the site root so the web server serves them directly
 * (fast, and lets the app's offline support and reminders work at /gladmoment/).
 * If a leftover "gladmoment" folder is in the way, it is renamed (never deleted).
 * If the files can't be written at all, the app is served through WordPress instead.
 */
function gladmoment_install() {
	$target = gladmoment_target_dir();
	update_option( 'gladmoment_moved_folder', '' );
	if ( is_dir( $target ) && ! file_exists( $target . '/' . GLADMOMENT_MARKER ) ) {
		// A folder we did not create, e.g. an earlier manual upload. Keep it, under another name.
		$moved = $target . '-old-' . gmdate( 'Ymd-His' );
		if ( @rename( $target, $moved ) ) {
			update_option( 'gladmoment_moved_folder', basename( $moved ) );
		} else {
			update_option( 'gladmoment_status', 'conflict' );
			gladmoment_purge_cache();
			return false;
		}
	}
	$ok = gladmoment_copy_dir( GLADMOMENT_SOURCE, $target );
	if ( $ok ) {
		@file_put_contents( $target . '/' . GLADMOMENT_MARKER, GLADMOMENT_VERSION );
		update_option( 'gladmoment_status', 'ok' );
		gladmoment_write_config();
	} else {
		// Remove a half-copied folder so WordPress can serve the app instead.
		if ( is_dir( $target ) && file_exists( $target . '/' . GLADMOMENT_MARKER ) === false ) {
			gladmoment_delete_dir( $target );
		}
		update_option( 'gladmoment_status', 'fallback' );
	}
	gladmoment_push_install();
	update_option( 'gladmoment_installed_version', GLADMOMENT_VERSION );
	gladmoment_purge_cache();
	return true;
}
register_activation_hook( __FILE__, 'gladmoment_install' );

/**
 * Fallback: when the app folder isn't in the site root, serve the app's files
 * from the plugin through WordPress, at the same address.
 */
function gladmoment_serve_fallback() {
	if ( is_admin() || empty( $_SERVER['REQUEST_URI'] ) ) {
		return;
	}
	$path = (string) wp_parse_url( wp_unslash( $_SERVER['REQUEST_URI'] ), PHP_URL_PATH );
	$home = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
	$base = rtrim( $home, '/' ) . '/' . GLADMOMENT_SLUG;
	if ( $path !== $base && 0 !== strpos( $path, $base . '/' ) ) {
		return;
	}
	if ( $path === $base ) {
		wp_safe_redirect( $base . '/', 301 );
		exit;
	}
	$rel = ltrim( rawurldecode( substr( $path, strlen( $base ) ) ), '/' );
	if ( '' === $rel ) {
		$rel = 'index.html';
	}
	if ( 'config.json' === $rel ) {
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true );
		}
		status_header( 200 );
		header( 'Content-Type: application/json' );
		header( 'Cache-Control: no-cache' );
		echo wp_json_encode( gladmoment_site_config() );
		exit;
	}
	// Never serve hidden files, and never leave the app folder.
	foreach ( explode( '/', $rel ) as $part ) {
		if ( '' === $part || '.' === $part[0] ) {
			return;
		}
	}
	$root = realpath( GLADMOMENT_SOURCE );
	$file = realpath( GLADMOMENT_SOURCE . '/' . $rel );
	if ( ! $root || ! $file || 0 !== strpos( $file, $root . DIRECTORY_SEPARATOR ) || ! is_file( $file ) ) {
		return;
	}
	$types = array(
		'html'        => 'text/html; charset=utf-8',
		'js'          => 'text/javascript; charset=utf-8',
		'css'         => 'text/css; charset=utf-8',
		'json'        => 'application/json',
		'webmanifest' => 'application/manifest+json',
		'svg'         => 'image/svg+xml',
		'png'         => 'image/png',
	);
	$ext = strtolower( pathinfo( $file, PATHINFO_EXTENSION ) );
	if ( ! isset( $types[ $ext ] ) ) {
		return;
	}
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );
	}
	status_header( 200 );
	header( 'Content-Type: ' . $types[ $ext ] );
	header( 'X-Content-Type-Options: nosniff' );
	if ( in_array( basename( $file ), array( 'index.html', 'sw.js' ), true ) ) {
		header( 'Cache-Control: no-cache' );
		header( 'X-LiteSpeed-Cache-Control: no-cache' );
	} else {
		header( 'Cache-Control: public, max-age=3600' );
	}
	header( 'Content-Length: ' . filesize( $file ) );
	readfile( $file );
	exit;
}
add_action( 'init', 'gladmoment_serve_fallback', 0 );

/** Remove the app files we installed when the plugin is deactivated. */
function gladmoment_uninstall_files() {
	$target = gladmoment_target_dir();
	if ( file_exists( $target . '/' . GLADMOMENT_MARKER ) ) {
		gladmoment_delete_dir( $target );
	}
	delete_option( 'gladmoment_status' );
	delete_option( 'gladmoment_installed_version' );
	wp_clear_scheduled_hook( 'gladmoment_push_tick' );
}
register_deactivation_hook( __FILE__, 'gladmoment_uninstall_files' );

/** After a plugin update, refresh the app files. */
add_action(
	'admin_init',
	function () {
		if ( get_option( 'gladmoment_installed_version' ) !== GLADMOMENT_VERSION ) {
			gladmoment_install();
		}
	}
);

/** Tell the site owner where the app is, or what went wrong. */
add_action(
	'admin_notices',
	function () {
		if ( ! current_user_can( 'activate_plugins' ) ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( $screen && ! in_array( $screen->id, array( 'plugins', 'dashboard' ), true ) ) {
			return;
		}
		$status = get_option( 'gladmoment_status' );
		$url    = esc_url( gladmoment_url() );
		$page   = esc_url( admin_url( 'options-general.php?page=gladmoment' ) );
		if ( 'ok' === $status || 'fallback' === $status ) {
			echo '<div class="notice notice-success"><p><strong>Gladmoment is live:</strong> <a href="' . $url . '" target="_blank" rel="noopener">' . $url . '</a>. Add it to your menu, or use <code>[gladmoment_button]</code> on any page. <a href="' . $page . '">Gladmoment settings</a></p></div>';
		} elseif ( 'conflict' === $status ) {
			echo '<div class="notice notice-warning"><p><strong>Gladmoment needs one small fix.</strong> A folder called <code>gladmoment</code> is in the way. Open <a href="' . $page . '">Settings → Gladmoment</a> for the steps.</p></div>';
		}
	}
);

/** 'fr' or 'en': an explicit shortcode attribute wins, otherwise the WordPress site language. */
function gladmoment_lang( $attr = '' ) {
	$attr = strtolower( (string) $attr );
	if ( 'fr' === $attr || 'en' === $attr ) {
		return $attr;
	}
	$locale = function_exists( 'get_locale' ) ? get_locale() : 'en_GB';
	return 0 === strpos( strtolower( $locale ), 'fr' ) ? 'fr' : 'en';
}

/** "Open Gladmoment" link on the Plugins screen. */
add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=gladmoment' ) ) . '">Settings</a>' );
		array_unshift( $links, '<a href="' . esc_url( gladmoment_url() ) . '" target="_blank" rel="noopener">Open Gladmoment</a>' );
		return $links;
	}
);

/** [gladmoment_button text="Try Gladmoment" lang="fr"] — a button linking to the app. */
add_shortcode(
	'gladmoment_button',
	function ( $atts ) {
		$atts  = shortcode_atts( array( 'text' => '', 'lang' => '' ), $atts, 'gladmoment_button' );
		$lang  = gladmoment_lang( $atts['lang'] );
		$text  = '' !== $atts['text'] ? $atts['text'] : ( 'fr' === $lang ? 'Ouvrir Gladmoment, notre application de gratitude gratuite' : 'Open Gladmoment, our free gratitude app' );
		$style = 'display:inline-block;padding:14px 26px;border-radius:999px;background:linear-gradient(135deg,#5b34c4,#8a3ac0);color:#fff;font-weight:700;text-decoration:none;';
		return '<a class="gladmoment-button" href="' . esc_url( gladmoment_url() ) . '" style="' . esc_attr( $style ) . '">💛 ' . esc_html( $text ) . '</a>';
	}
);

/**
 * [gladmoment_landing] — a complete landing section introducing the app.
 * Add it to a new WordPress page (for example "Gladmoment") with a Shortcode block.
 */
add_shortcode(
	'gladmoment_landing',
	function ( $atts ) {
		$atts = shortcode_atts( array( 'lang' => '' ), $atts, 'gladmoment_landing' );
		$fr   = 'fr' === gladmoment_lang( $atts['lang'] );
		$url  = esc_url( gladmoment_url() );
		$priv = esc_url( gladmoment_url() . ( $fr ? 'privacy-fr.html' : 'privacy.html' ) );
		$s    = $fr ? array(
			'aria'     => 'Gladmoment, application de gratitude',
			'h'        => 'Faites une pause. Remarquez. Dites merci.',
			'lead'     => 'Gladmoment est une application de gratitude gratuite de Gemrhythm. De doux rappels au fil de la journée vous aident à remarquer une bonne chose, en quelques secondes seulement.',
			'open'     => '💛 Ouvrir Gladmoment, c’est gratuit',
			'note'     => 'Sans inscription. Fonctionne sur téléphone, tablette et ordinateur.',
			'why'      => 'Pourquoi vous allez l’aimer',
			'f'        => array(
				array( '🔔', 'Une douce cloche de gratitude', 'Des rappels toutes les quelques heures, aux moments que vous choisissez. Mode vibreur pour le travail ou l’école.' ),
				array( '✍️', 'Écrire, dire ou toucher', 'Écrivez, dictez, ou touchez une idée toute prête. Dix secondes suffisent.' ),
				array( '🎵', 'Une pause calme d’une minute', 'Respirez avec les sons apaisants de Gemrhythm, puis remarquez une bonne chose.' ),
				array( '✨', 'Défis de 7, 21 et 30 jours', 'Un nouveau thème chaque jour : famille, nature, argent, souvenirs et plus encore.' ),
				array( '🔥', 'Des séries sans pression', 'Suivez votre habitude avec bienveillance. Un jour manqué ? Aujourd’hui est une nouvelle occasion de commencer.' ),
				array( '💌', 'Partagez une carte de gratitude', 'Transformez un moment en belle image pour WhatsApp ou Instagram.' ),
			),
			'install'  => 'Ajoutez-la à votre écran d’accueil',
			'ios'      => '📱 iPhone (Safari)',
			'ios1'     => 'Ouvrez <a href="' . $url . '">Gladmoment</a> dans Safari.',
			'ios2'     => 'Touchez le bouton Partager (le carré avec une flèche).',
			'ios3'     => 'Choisissez <strong>Sur l’écran d’accueil</strong>, puis <strong>Ajouter</strong>.',
			'and'      => '🤖 Android (Chrome)',
			'and1'     => 'Ouvrez <a href="' . $url . '">Gladmoment</a> dans Chrome.',
			'and2'     => 'Touchez le menu ⋮ en haut à droite.',
			'and3'     => 'Choisissez <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.',
			'privh'    => '🔒 Votre journal reste privé',
			'privp'    => 'Vos gratitudes sont enregistrées uniquement sur votre propre appareil. Pas de compte, pas de pistage, pas de publicité. <a href="' . $priv . '">Lire la politique de confidentialité</a>.',
			'cta'      => 'Commencer mon premier moment de gratitude',
			'lang'     => 'fr',
		) : array(
			'aria'     => 'Gladmoment gratitude app',
			'h'        => 'Pause. Notice. Give thanks.',
			'lead'     => 'Gladmoment is a free gratitude app from Gemrhythm. Gentle reminders through your day help you notice one good thing, and it only takes a few seconds.',
			'open'     => '💛 Open Gladmoment, it’s free',
			'note'     => 'No sign-up. Works on any phone, tablet or computer.',
			'why'      => 'Why you’ll love it',
			'f'        => array(
				array( '🔔', 'A gentle gratitude bell', 'Reminders every few hours, at the times you choose. Vibrate-only for work or school.' ),
				array( '✍️', 'Write, say or tap', 'Type it, speak it, or tap a ready-made idea. Ten seconds is enough.' ),
				array( '🎵', '1-minute calm pause', 'Breathe with soothing Gemrhythm sounds, then notice one good thing.' ),
				array( '✨', '7, 21 &amp; 30-day challenges', 'A new theme each day: family, nature, money, memories and more.' ),
				array( '🔥', 'Streaks without pressure', 'Track your habit kindly. Miss a day? Today is another chance to begin.' ),
				array( '💌', 'Share a gratitude card', 'Turn a moment into a beautiful picture for WhatsApp or Instagram.' ),
			),
			'install'  => 'Add it to your home screen',
			'ios'      => '📱 iPhone (Safari)',
			'ios1'     => 'Open <a href="' . $url . '">Gladmoment</a> in Safari.',
			'ios2'     => 'Tap the Share button (square with an arrow).',
			'ios3'     => 'Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.',
			'and'      => '🤖 Android (Chrome)',
			'and1'     => 'Open <a href="' . $url . '">Gladmoment</a> in Chrome.',
			'and2'     => 'Tap the ⋮ menu at the top right.',
			'and3'     => 'Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.',
			'privh'    => '🔒 Your journal stays private',
			'privp'    => 'Your gratitude entries are saved only on your own device. There’s no account, no tracking and no adverts. <a href="' . $priv . '">Read the privacy policy</a>.',
			'cta'      => 'Start your first glad moment',
			'lang'     => 'en',
		);
		ob_start();
		?>
<style>
.glm{--glm-ink:#241936;--glm-muted:#5f5472;--glm-soft:#f6f0ff;--glm-card:#ffffff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--glm-ink);line-height:1.6;max-width:960px;margin:0 auto}
.glm *{box-sizing:border-box}
.glm-hero{background:linear-gradient(140deg,#4b2aae 0%,#7536bf 38%,#a8408f 72%,#c4513f 100%);color:#fff;border-radius:28px;padding:44px 28px;text-align:center}
.glm-hero h2{font-family:Georgia,"Times New Roman",serif;font-weight:600;font-size:clamp(1.9rem,5vw,2.8rem);line-height:1.2;margin:0 0 12px;color:#fff}
.glm-hero p{font-size:1.15rem;max-width:36em;margin:0 auto 22px;opacity:.95}
.glm-btn{display:inline-block;padding:15px 28px;border-radius:999px;background:#fff;color:#4a27a8!important;font-weight:800;text-decoration:none!important;font-size:1.05rem}
.glm-btn.alt{background:linear-gradient(135deg,#5b34c4,#8a3ac0);color:#fff!important}
.glm-note{font-size:.9rem;opacity:.9;margin-top:12px!important}
.glm h3{font-family:Georgia,"Times New Roman",serif;font-weight:600;font-size:1.6rem;text-align:center;margin:44px 0 18px}
.glm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.glm-card{background:var(--glm-card);border:1px solid #ebe1f6;border-radius:20px;padding:20px;box-shadow:0 12px 32px -18px rgba(76,40,140,.35)}
.glm-card .ic{font-size:1.8rem}
.glm-card h4{margin:6px 0 4px;font-size:1.1rem}
.glm-card p{margin:0;color:var(--glm-muted)}
.glm-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.glm-steps ol{margin:8px 0 0;padding-left:1.2em}
.glm-steps li{margin:4px 0}
.glm-privacy{background:var(--glm-soft);border-radius:20px;padding:24px;text-align:center;margin-top:36px}
.glm-privacy p{max-width:40em;margin:6px auto 0;color:var(--glm-muted)}
.glm-cta{text-align:center;margin:36px 0 10px}
</style>
<section class="glm" lang="<?php echo esc_attr( $s['lang'] ); ?>" aria-label="<?php echo esc_attr( $s['aria'] ); ?>">
	<div class="glm-hero">
		<h2><?php echo esc_html( $s['h'] ); ?></h2>
		<p><?php echo esc_html( $s['lead'] ); ?></p>
		<a class="glm-btn" href="<?php echo $url; ?>"><?php echo esc_html( $s['open'] ); ?></a>
		<p class="glm-note"><?php echo esc_html( $s['note'] ); ?></p>
	</div>

	<h3><?php echo esc_html( $s['why'] ); ?></h3>
	<div class="glm-grid">
		<?php foreach ( $s['f'] as $f ) : ?>
		<div class="glm-card"><div class="ic"><?php echo $f[0]; ?></div><h4><?php echo $f[1]; ?></h4><p><?php echo esc_html( $f[2] ); ?></p></div>
		<?php endforeach; ?>
	</div>

	<h3><?php echo esc_html( $s['install'] ); ?></h3>
	<div class="glm-steps">
		<div class="glm-card"><h4><?php echo esc_html( $s['ios'] ); ?></h4><ol><li><?php echo $s['ios1']; ?></li><li><?php echo esc_html( $s['ios2'] ); ?></li><li><?php echo $s['ios3']; ?></li></ol></div>
		<div class="glm-card"><h4><?php echo esc_html( $s['and'] ); ?></h4><ol><li><?php echo $s['and1']; ?></li><li><?php echo esc_html( $s['and2'] ); ?></li><li><?php echo $s['and3']; ?></li></ol></div>
	</div>

	<div class="glm-privacy">
		<strong><?php echo esc_html( $s['privh'] ); ?></strong>
		<p><?php echo $s['privp']; ?></p>
	</div>

	<div class="glm-cta"><a class="glm-btn alt" href="<?php echo $url; ?>"><?php echo esc_html( $s['cta'] ); ?></a></div>
</section>
		<?php
		return ob_get_clean();
	}
);

/** Settings → Gladmoment: status, link and a Repair button. */
add_action(
	'admin_menu',
	function () {
		add_options_page( 'Gladmoment', 'Gladmoment', 'manage_options', 'gladmoment', 'gladmoment_settings_page' );
	}
);

add_action(
	'admin_post_gladmoment_music',
	function () {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Not allowed.' );
		}
		check_admin_referer( 'gladmoment_music' );
		$music = isset( $_POST['music_url'] ) ? esc_url_raw( trim( wp_unslash( $_POST['music_url'] ) ), array( 'http', 'https' ) ) : '';
		update_option( 'gladmoment_music_url', $music ? $music : 'https://gemrhythm.com/playlist-category/relaxation/' );
		$tracks = array();
		$lines  = isset( $_POST['pause_tracks'] ) ? preg_split( '/[\r\n]+/', (string) wp_unslash( $_POST['pause_tracks'] ) ) : array();
		foreach ( $lines as $line ) {
			$url = esc_url_raw( trim( $line ), array( 'http', 'https' ) );
			if ( $url ) {
				$tracks[] = $url;
			}
		}
		update_option( 'gladmoment_pause_tracks', array_slice( $tracks, 0, 20 ) );
		gladmoment_write_config();
		gladmoment_purge_cache();
		wp_safe_redirect( admin_url( 'options-general.php?page=gladmoment&music=1' ) );
		exit;
	}
);

add_action(
	'admin_post_gladmoment_repair',
	function () {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Not allowed.' );
		}
		check_admin_referer( 'gladmoment_repair' );
		gladmoment_install();
		wp_safe_redirect( admin_url( 'options-general.php?page=gladmoment&repaired=1' ) );
		exit;
	}
);

function gladmoment_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$status = get_option( 'gladmoment_status' );
	$url    = gladmoment_url();
	$moved  = get_option( 'gladmoment_moved_folder' );
	$check  = null;
	if ( 'conflict' !== $status && function_exists( 'wp_remote_get' ) ) {
		$res = wp_remote_get( add_query_arg( 'check', time(), $url ), array( 'timeout' => 8, 'sslverify' => false ) );
		if ( ! is_wp_error( $res ) ) {
			$check = ( 200 === (int) wp_remote_retrieve_response_code( $res ) && false !== strpos( wp_remote_retrieve_body( $res ), 'Gladmoment' ) );
		}
	}
	echo '<div class="wrap"><h1>Gladmoment</h1>';
	if ( isset( $_GET['repaired'] ) ) {
		echo '<div class="notice notice-success"><p>Repair finished. Cache cleared.</p></div>';
	}
	echo '<p style="font-size:15px">Your app address: <a href="' . esc_url( $url ) . '" target="_blank" rel="noopener"><strong>' . esc_html( $url ) . '</strong></a></p>';
	if ( true === $check ) {
		echo '<p style="font-size:15px">✅ <strong>Working.</strong> Visitors can open Gladmoment at the address above.</p>';
	} elseif ( false === $check ) {
		echo '<p style="font-size:15px">⚠️ <strong>The address did not open from here.</strong> Click <em>Repair Gladmoment</em> below. If it still does not open, clear your cache plugin and try the address in a private window.</p>';
	}
	if ( 'ok' === $status ) {
		echo '<p>The app files are in your site folder: <code>' . esc_html( gladmoment_target_dir() ) . '</code></p>';
	} elseif ( 'fallback' === $status ) {
		echo '<p>WordPress is serving the app from the plugin, because the app files could not be copied into your site folder. This works fine.</p>';
	} elseif ( 'conflict' === $status ) {
		echo '<p style="font-size:15px">⚠️ <strong>A folder called <code>gladmoment</code> is in the way</strong> and could not be renamed automatically. In Hostinger File Manager, open <code>public_html</code>, rename the <code>gladmoment</code> folder (for example to <code>gladmoment-old</code>), then click <em>Repair Gladmoment</em>.</p>';
	}
	if ( $moved ) {
		echo '<p>An older <code>gladmoment</code> folder was found and kept as <code>' . esc_html( $moved ) . '</code>. You can delete it in File Manager if you don’t need it.</p>';
	}
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
	wp_nonce_field( 'gladmoment_repair' );
	echo '<input type="hidden" name="action" value="gladmoment_repair">';
	submit_button( 'Repair Gladmoment', 'primary', 'submit', false );
	echo '</form>';
	if ( isset( $_GET['music'] ) ) {
		echo '<div class="notice notice-success"><p>Music settings saved.</p></div>';
	}
	$cfg = gladmoment_site_config();
	echo '<h2>Music</h2>';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
	wp_nonce_field( 'gladmoment_music' );
	echo '<input type="hidden" name="action" value="gladmoment_music">';
	echo '<p><label for="gm-music-url"><strong>Playlist link</strong> (the "relaxation playlists" link on the app’s Home screen, Insights and after the pause)</label><br>';
	echo '<input type="url" id="gm-music-url" name="music_url" class="large-text" value="' . esc_attr( $cfg['musicUrl'] ) . '"></p>';
	echo '<p><label for="gm-tracks"><strong>Pause music</strong>: links to audio files (MP3), one per line. The 1-minute pause plays one of them at random.</label><br>';
	echo '<textarea id="gm-tracks" name="pause_tracks" rows="5" class="large-text code" placeholder="https://gemrhythm.com/wp-content/uploads/2026/11/relaxing-track.mp3">' . esc_textarea( implode( "\n", $cfg['pauseTracks'] ) ) . '</textarea>';
	echo '<span class="description">How to get a link: Media → Library → click the track → <em>Copy URL to clipboard</em>. If this is empty, the pause plays gentle chimes.</span></p>';
	submit_button( 'Save music settings', 'secondary', 'submit', false );
	echo '</form>';
	gladmoment_push_settings_section();
	echo '<h2>Show Gladmoment to your visitors</h2><ul style="list-style:disc;padding-left:20px">';
	echo '<li><strong>Menu:</strong> Appearance → Menus → Custom Links → URL <code>' . esc_html( $url ) . '</code></li>';
	echo '<li><strong>Button on any page:</strong> add a Shortcode block with <code>[gladmoment_button]</code></li>';
	echo '<li><strong>Full landing section:</strong> <code>[gladmoment_landing]</code> (French: <code>[gladmoment_landing lang="fr"]</code>)</li>';
	echo '</ul><p>Version ' . esc_html( GLADMOMENT_VERSION ) . '</p></div>';
}
