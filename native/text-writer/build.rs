fn main() {
    #[cfg(target_os = "windows")]
    {
        let mut res = tauri_winres::WindowsResource::new();

        // Set all metadata
        res.set_manifest_file("text-writer.manifest");
        res.set("FileDescription", "Accessibility Text Input Utility - Assists with text entry for productivity applications");
        res.set("ProductName", "Text Writer - Accessibility Tool");
        res.set("CompanyName", "Demox Labs");
        res.set(
            "LegalCopyright",
            "Copyright © 2025 Demox Labs. All rights reserved.",
        );
        res.set("FileVersion", "0.1.0.0");
        res.set("ProductVersion", "0.1.0.0");
        res.set("InternalName", "text-writer");
        res.set("OriginalFilename", "text-writer.exe");
        res.set(
            "Comments",
            "Accessibility utility for enhanced text input via command-line interface",
        );

        res.compile().unwrap();
    }
}
