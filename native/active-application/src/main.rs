use active_win_pos_rs::ActiveWindow;
use serde_json::json;

fn main() {
    match active_win_pos_rs::get_active_window() {
        Ok(active_window) => output_result(active_window),
        Err(e) => {
            eprintln!("{}", json!({ "error": e }));
            std::process::exit(1);
        }
    }
}

fn output_result(active_window: ActiveWindow) {
    let event_json = json!({
        "title": active_window.title,
        "appName": active_window.app_name,
        "windowId": active_window.window_id,
        "processId": active_window.process_id,
        "position": {
            "x": active_window.position.x,
            "y": active_window.position.y,
            "width": active_window.position.width,
            "height": active_window.position.height,
        },
    });

    println!("{}", event_json);
}
