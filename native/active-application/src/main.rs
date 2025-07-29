fn main() {
    let active_window = active_win_pos_rs::get_active_window().unwrap();
    println!("{:?}", active_window);
}
