<?php
/**
 * Plugin Name:       Gladmoment
 * Description:       A gentle gratitude reminder and journal. Installs the Gladmoment app at yoursite.com/gladmoment/ and adds a [gladmoment_button] shortcode.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Gemrhythm
 * License:           MIT
 * Text Domain:       gladmoment
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GLADMOMENT_VERSION', '1.0.0' );
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

/** "Open Gladmoment" link on the Plugins screen. */
add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		array_unshift( $links, '<a href="' . esc_url( gladmoment_url() ) . '" target="_blank" rel="noopener">Open Gladmoment</a>' );
		return $links;
	}
);

/** [gladmoment_button text="Try Gladmoment"] — a button linking to the app. */
add_shortcode(
	'gladmoment_button',
	function ( $atts ) {
		$atts = shortcode_atts( array( 'text' => 'Open Gladmoment, our free gratitude app' ), $atts, 'gladmoment_button' );
		$style = 'display:inline-block;padding:14px 26px;border-radius:999px;background:linear-gradient(135deg,#5b34c4,#8a3ac0);color:#fff;font-weight:700;text-decoration:none;';
		return '<a class="gladmoment-button" href="' . esc_url( gladmoment_url() ) . '" style="' . esc_attr( $style ) . '">💛 ' . esc_html( $atts['text'] ) . '</a>';
	}
);
