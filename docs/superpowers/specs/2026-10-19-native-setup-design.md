# Native Setup simplification

The project owner approved implementation on 2026-10-19.

- Setup requests administrator privileges on launch using Inno Setup. This applies to both modes in the shared executable.
- Native mode creates `BeCoder.lnk` directly in the common Programs folder through `[Icons]`. Inno manages its uninstall lifecycle.
- One native installation is registered for the computer using a fixed AppId and HKLM uninstall registration. A second native destination is rejected until the existing installation is uninstalled. Same-directory replacement retains explicit data-loss consent.
- Portable installations remain independent and do not register an uninstaller or common Start-menu entry. The existing optional desktop task is preserved.
- Portable cannot overwrite the registered native installation. No migration of old snapshots, legacy shortcuts or old user-level registrations is introduced.
- Remove the C++ shortcut helper, its build wrapper, hash checks, delayed elevation, legacy cleanup and obsolete tests.
- Preserve self-contained data, installation ownership markers, path restrictions, foreign-directory protection and external workspaces.
- Update English/Chinese documentation and the direct Setup verifier. Verify with a uniquely named minimal actual installer, then the standard source/build/package/Setup gates. No installed editor launch or unrelated cleanup. Commit/push was excluded during implementation and explicitly authorized after acceptance.

Acceptance: the project owner accepted the delivered Setup on 2026-10-19, then authorized documentation closeout, the About attribution update to Code-OSS (MIT) 1.140.0, and local commit/push to the corresponding feature branch. Automated installation checks and owner acceptance remain separate evidence.
