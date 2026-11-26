; QASSIMZ Hub — Inno Setup 6 Script (Per-User, Animated 3D Wizard Logo)
#ifndef AppVer
  #define AppVer "1.0.0"
#endif
#define AppName "QASSIMZ Hub"
#define AppExe "QASSIMZ Hub.exe"
#define Repo "https://github.com/ahmedqassimtv-commits/qassimz-hub"

[Setup]
AppId=QASSIMZ.Hub
AppName={#AppName}
AppVersion={#AppVer}
AppPublisher=Ahmed Qassim — QASSIMZ
AppPublisherURL={#Repo}
AppSupportURL={#Repo}/issues
AppUpdatesURL={#Repo}/releases
DefaultDirName={localappdata}\Programs\QASSIMZ Hub
DefaultGroupName=QASSIMZ
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
CloseApplications=force
RestartApplications=no
OutputDir=..\dist
OutputBaseFilename=QASSIMZ-Hub-Setup-{#AppVer}
SetupIconFile=..\assets\logo.ico
UninstallDisplayIcon={app}\{#AppExe}
WizardStyle=modern
WizardImageFile=wizard.bmp
WizardSmallImageFile=wizard-small.bmp
WizardImageStretch=yes
InfoBeforeFile=..\docs\INSTRUCTIONS-AR.txt
LicenseFile=..\LICENSE
Compression=lzma2/ultra
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
#if FileExists(AddBackslash(SourcePath) + "Arabic.isl")
Name: "arabic"; MessagesFile: "Arabic.isl"
#endif
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "anim\*.bmp"; DestDir: "{tmp}\anim"; Flags: dontcopy
Source: "..\dist\QASSIMZ Hub\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\docs\INSTRUCTIONS-AR.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\تعليمات الاستخدام"; Filename: "{app}\INSTRUCTIONS-AR.txt"
Name: "{group}\GitHub — QASSIMZ Hub"; Filename: "{#Repo}"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "QASSIMZ Hub"; Flags: uninsdeletevalue dontcreatekey

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/F /IM ""QASSIMZ Hub.exe"""; Flags: runhidden; RunOnceId: "KillQassimzHub"

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\{#AppExe}"; Flags: nowait; Check: ShouldSilentRun

[Code]
function ShouldSilentRun: Boolean;
begin
  Result := WizardSilent and (ExpandConstant('{param:AUTORUN|1}') = '1');
end;

const
  FRAMES = 36;
  FRAME_MS = 55;

var
  AnimTimer: LongWord;
  AnimFrame: Integer;
  AnimDir: String;

function SetTimer(hWnd: LongWord; nIDEvent, uElapse: LongWord; lpTimerFunc: LongWord): LongWord;
  external 'SetTimer@user32.dll stdcall';
function KillTimer(hWnd: LongWord; uIDEvent: LongWord): BOOL;
  external 'KillTimer@user32.dll stdcall';

function Pad2(N: Integer): String;
begin
  if N < 10 then Result := '0' + IntToStr(N) else Result := IntToStr(N);
end;

procedure AnimTick(Wnd: LongWord; Msg: LongWord; IdEvent: LongWord; Time: LongWord);
var
  S: String;
begin
  AnimFrame := (AnimFrame + 1) mod FRAMES;
  S := Pad2(AnimFrame);
  try
    if WizardForm.WizardBitmapImage.Visible then
      WizardForm.WizardBitmapImage.Bitmap.LoadFromFile(AnimDir + '\big' + S + '.bmp');
    if WizardForm.WizardBitmapImage2.Visible then
      WizardForm.WizardBitmapImage2.Bitmap.LoadFromFile(AnimDir + '\big' + S + '.bmp');
    if WizardForm.WizardSmallBitmapImage.Visible then
      WizardForm.WizardSmallBitmapImage.Bitmap.LoadFromFile(AnimDir + '\small' + S + '.bmp');
  except
  end;
end;

procedure InitializeWizard;
begin
  try
    ExtractTemporaryFiles('{tmp}\anim\*.bmp');
    AnimDir := ExpandConstant('{tmp}\anim');
    AnimFrame := 0;
    AnimTimer := SetTimer(0, 0, FRAME_MS, CreateCallback(@AnimTick));
  except
    AnimTimer := 0;
  end;
end;

procedure DeinitializeSetup;
begin
  if AnimTimer <> 0 then KillTimer(0, AnimTimer);
end;
