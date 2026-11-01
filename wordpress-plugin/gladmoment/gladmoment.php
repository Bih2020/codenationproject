<?php
/**
 * Plugin Name:       Gladmoment
 * Description:       A gentle gratitude reminder and journal. Installs the Gladmoment app at yoursite.com/gladmoment/ and adds the [gladmoment_landing] and [gladmoment_button] shortcodes.
 * Version:           1.4.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Gemrhythm
 * License:           MIT
 * Text Domain:       gladmoment
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GLADMOMENT_VERSION', '1.4.0' );
define( 'GLADMOMENT_SLUG', 'gladmoment' );
define( 'GLADMOMENT_SOURCE', __DIR__ . '/app' );
define( 'GLADMOMENT_MARKER', '.gladmoment-plugin' );

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

/**
 * Put the app files in the site root so the web server serves them directly
 * (fast, and lets the app's offline support and reminders work at /gladmoment/).
 */
function gladmoment_install() {
	$target = gladmoment_target_dir();
	if ( is_dir( $target ) && ! file_exists( $target . '/' . GLADMOMENT_MARKER ) ) {
		// A folder we did not create (for example a manual upload). Leave it alone.
		if ( file_exists( $target . '/index.html' ) ) {
			update_option( 'gladmoment_status', 'manual' );
			update_option( 'gladmoment_installed_version', GLADMOMENT_VERSION );
			return true;
		}
		update_option( 'gladmoment_status', 'conflict' );
		return false;
	}
	$ok = gladmoment_copy_dir( GLADMOMENT_SOURCE, $target );
	if ( $ok ) {
		@file_put_contents( $target . '/' . GLADMOMENT_MARKER, GLADMOMENT_VERSION );
		update_option( 'gladmoment_status', 'ok' );
		update_option( 'gladmoment_installed_version', GLADMOMENT_VERSION );
	} else {
		update_option( 'gladmoment_status', 'not_writable' );
	}
	return $ok;
}
register_activation_hook( __FILE__, 'gladmoment_install' );

/** Remove the app files we installed when the plugin is deactivated. */
function gladmoment_uninstall_files() {
	$target = gladmoment_target_dir();
	if ( file_exists( $target . '/' . GLADMOMENT_MARKER ) ) {
		gladmoment_delete_dir( $target );
	}
	delete_option( 'gladmoment_status' );
	delete_option( 'gladmoment_installed_version' );
}
register_deactivation_hook( __FILE__, 'gladmoment_uninstall_files' );

/** After a plugin update, refresh the app files. */
add_action(
	'admin_init',
	function () {
		if ( get_option( 'gladmoment_installed_version' ) !== GLADMOMENT_VERSION && 'manual' !== get_option( 'gladmoment_status' ) ) {
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
		if ( 'ok' === $status || 'manual' === $status ) {
			echo '<div class="notice notice-success"><p><strong>Gladmoment is live:</strong> <a href="' . $url . '" target="_blank" rel="noopener">' . $url . '</a>. Add it to a menu, or use the shortcode <code>[gladmoment_button]</code> on any page.</p></div>';
		} elseif ( 'not_writable' === $status ) {
			echo '<div class="notice notice-error"><p><strong>Gladmoment could not copy its files</strong> into your site folder. Ask your host to allow WordPress to write to <code>' . esc_html( ABSPATH ) . '</code>, or upload the Gladmoment website ZIP with File Manager instead.</p></div>';
		} elseif ( 'conflict' === $status ) {
			echo '<div class="notice notice-warning"><p><strong>Gladmoment did not install</strong> because a folder called <code>gladmoment</code> already exists in your site folder. Rename or delete that folder with File Manager, then deactivate and activate this plugin again.</p></div>';
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
