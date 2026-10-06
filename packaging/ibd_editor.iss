; Inno Setup Skript für den IBD Editor (Windows-Installer)
; Erzeugt dist\IBD-Editor-Setup.exe
; Aufruf:  iscc packaging\ibd_editor.iss   (nach dem PyInstaller-Build)
; Quelle ist der PyInstaller-Ausgabeordner build\windows\dist\IBD-Editor.

[Setup]
AppName=IBD Editor
AppVersion=1.0.0
AppPublisher=GDG Stuttgart
DefaultDirName={autopf}\IBD Editor
DefaultGroupName=IBD Editor
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=IBD-Editor-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"

[Files]
; der komplette PyInstaller-Ausgabeordner
Source: "..\build\windows\dist\IBD-Editor\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\IBD Editor"; Filename: "{app}\IBD-Editor.exe"
Name: "{autodesktop}\IBD Editor"; Filename: "{app}\IBD-Editor.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Desktop-Verknüpfung erstellen"; GroupDescription: "Zusätzliche Symbole:"

[Run]
Filename: "{app}\IBD-Editor.exe"; Description: "IBD Editor starten"; Flags: nowait postinstall skipifsilent
