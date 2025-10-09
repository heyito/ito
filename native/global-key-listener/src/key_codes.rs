use rdev::Key;

/// Maps a Key enum variant to its corresponding key code
pub fn key_to_code(key: &Key) -> Option<u32> {
    match key {
        Key::Alt => Some(18),
        Key::AltGr => Some(225),
        Key::Backspace => Some(8),
        Key::CapsLock => Some(20),
        Key::ControlLeft => Some(17),
        Key::ControlRight => Some(17),
        Key::Delete => Some(46),
        Key::DownArrow => Some(40),
        Key::End => Some(35),
        Key::Escape => Some(27),
        Key::F1 => Some(112),
        Key::F2 => Some(113),
        Key::F3 => Some(114),
        Key::F4 => Some(115),
        Key::F5 => Some(116),
        Key::F6 => Some(117),
        Key::F7 => Some(118),
        Key::F8 => Some(119),
        Key::F9 => Some(120),
        Key::F10 => Some(121),
        Key::F11 => Some(122),
        Key::F12 => Some(123),
        Key::Home => Some(36),
        Key::LeftArrow => Some(37),
        Key::MetaLeft => Some(91),
        Key::MetaRight => Some(92),
        Key::PageDown => Some(34),
        Key::PageUp => Some(33),
        Key::Return => Some(13),
        Key::RightArrow => Some(39),
        Key::ShiftLeft => Some(16),
        Key::ShiftRight => Some(16),
        Key::Space => Some(32),
        Key::Tab => Some(9),
        Key::UpArrow => Some(38),
        Key::PrintScreen => Some(44),
        Key::ScrollLock => Some(145),
        Key::Pause => Some(19),
        Key::NumLock => Some(144),
        Key::BackQuote => Some(192),
        Key::Num1 => Some(49),
        Key::Num2 => Some(50),
        Key::Num3 => Some(51),
        Key::Num4 => Some(52),
        Key::Num5 => Some(53),
        Key::Num6 => Some(54),
        Key::Num7 => Some(55),
        Key::Num8 => Some(56),
        Key::Num9 => Some(57),
        Key::Num0 => Some(48),
        Key::Minus => Some(189),
        Key::Equal => Some(187),
        Key::KeyQ => Some(81),
        Key::KeyW => Some(87),
        Key::KeyE => Some(69),
        Key::KeyR => Some(82),
        Key::KeyT => Some(84),
        Key::KeyY => Some(89),
        Key::KeyU => Some(85),
        Key::KeyI => Some(73),
        Key::KeyO => Some(79),
        Key::KeyP => Some(80),
        Key::LeftBracket => Some(219),
        Key::RightBracket => Some(221),
        Key::KeyA => Some(65),
        Key::KeyS => Some(83),
        Key::KeyD => Some(68),
        Key::KeyF => Some(70),
        Key::KeyG => Some(71),
        Key::KeyH => Some(72),
        Key::KeyJ => Some(74),
        Key::KeyK => Some(75),
        Key::KeyL => Some(76),
        Key::SemiColon => Some(186),
        Key::Quote => Some(222),
        Key::BackSlash => Some(220),
        Key::IntlBackslash => Some(226),
        Key::KeyZ => Some(90),
        Key::KeyX => Some(88),
        Key::KeyC => Some(67),
        Key::KeyV => Some(86),
        Key::KeyB => Some(66),
        Key::KeyN => Some(78),
        Key::KeyM => Some(77),
        Key::Comma => Some(188),
        Key::Dot => Some(190),
        Key::Slash => Some(191),
        Key::Function => Some(179),
        _ => None, // For keys that don't have a standard code
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_to_code_letters() {
        // Test common letter keys
        assert_eq!(key_to_code(&Key::KeyA), Some(65));
        assert_eq!(key_to_code(&Key::KeyZ), Some(90));
        assert_eq!(key_to_code(&Key::KeyC), Some(67));
    }

    #[test]
    fn test_key_to_code_numbers() {
        // Test number keys
        assert_eq!(key_to_code(&Key::Num0), Some(48));
        assert_eq!(key_to_code(&Key::Num5), Some(53));
        assert_eq!(key_to_code(&Key::Num9), Some(57));
    }

    #[test]
    fn test_key_to_code_modifiers() {
        // Test modifier keys
        assert_eq!(key_to_code(&Key::ControlLeft), Some(17));
        assert_eq!(key_to_code(&Key::ControlRight), Some(17));
        assert_eq!(key_to_code(&Key::ShiftLeft), Some(16));
        assert_eq!(key_to_code(&Key::ShiftRight), Some(16));
        assert_eq!(key_to_code(&Key::Alt), Some(18));
    }

    #[test]
    fn test_key_to_code_function_keys() {
        // Test function keys
        assert_eq!(key_to_code(&Key::F1), Some(112));
        assert_eq!(key_to_code(&Key::F12), Some(123));
        assert_eq!(key_to_code(&Key::Function), Some(179));
    }

    #[test]
    fn test_key_to_code_special_keys() {
        // Test special keys
        assert_eq!(key_to_code(&Key::Escape), Some(27));
        assert_eq!(key_to_code(&Key::Return), Some(13));
        assert_eq!(key_to_code(&Key::Space), Some(32));
        assert_eq!(key_to_code(&Key::Tab), Some(9));
        assert_eq!(key_to_code(&Key::Backspace), Some(8));
    }

    #[test]
    fn test_key_to_code_arrow_keys() {
        // Test arrow keys
        assert_eq!(key_to_code(&Key::UpArrow), Some(38));
        assert_eq!(key_to_code(&Key::DownArrow), Some(40));
        assert_eq!(key_to_code(&Key::LeftArrow), Some(37));
        assert_eq!(key_to_code(&Key::RightArrow), Some(39));
    }
}
