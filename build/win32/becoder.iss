[Setup]
AppName={#NameLong}
AppVerName={#NameLong} {#Version}
AppVersion={#Version}
AppPublisher=Bc408
AppPublisherURL=https://github.com/Bc408/BeCoder
AppSupportURL=https://github.com/Bc408/BeCoder/issues
AppUpdatesURL=https://github.com/Bc408/BeCoder/releases
DefaultDirName={localappdata}\Programs\BeCoder
OutputDir={#OutputDir}
OutputBaseFilename=BeCoderSetup-x64-{#Version}
Compression=lzma2/ultra64
SolidCompression=yes
SetupIconFile={#RepoDir}\resources\win32\code.ico
Uninstallable=no
CreateUninstallRegKey=no
MinVersion=10.0
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
RestartApplications=no
ChangesAssociations=no
ChangesEnvironment=no
WizardStyle=modern
UsePreviousAppDir=no
UsePreviousGroup=no
UsePreviousLanguage=no
UsePreviousPrivileges=no
UsePreviousSetupType=no
UsePreviousTasks=no
UsePreviousUserInfo=no
SourceDir={#SourceDir}
#ifdef Sign
SignTool=esrp
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl,{#RepoDir}\build\win32\i18n\messages.en.isl"
Name: "simplifiedChinese"; MessagesFile: "{#RepoDir}\build\win32\i18n\Default.zh-cn.isl,{#RepoDir}\build\win32\i18n\messages.zh-cn.isl"

[CustomMessages]
english.ForeignDirectory=The selected folder is not empty and is not a BeCoder installation. Choose an empty dedicated BeCoder folder.
simplifiedChinese.ForeignDirectory=所选文件夹非空且不是 BeCoder 安装目录。请选择一个专用于 BeCoder 的空文件夹。
english.UnsafeDirectory=BeCoder cannot be installed directly into a drive root. Choose a dedicated BeCoder folder.
simplifiedChinese.UnsafeDirectory=BeCoder 不能直接安装到磁盘根目录。请选择一个专用于 BeCoder 的文件夹。
english.UnsupportedPath=The BeCoder installation path must contain only ASCII characters and be no longer than 70 characters. Choose a shorter path such as C:\BeCoder.
simplifiedChinese.UnsupportedPath=BeCoder 安装路径只能包含 ASCII 字符，且总长度不能超过 70 个字符。请选择更短的路径，例如 C:\BeCoder。
english.ReplaceWarning=Reinstalling BeCoder permanently deletes all BeCoder settings, extensions, history, and other data in this installation. Export BeCoder user data before continuing. Continue with complete replacement?
simplifiedChinese.ReplaceWarning=重新安装 BeCoder 将永久删除此安装中的全部 BeCoder 设置、扩展、历史记录和其他数据。请先导出 BeCoder 用户数据。是否继续完整覆盖？
english.SilentReplaceBlocked=Silent replacement requires explicit data-loss consent. Export BeCoder user data, then rerun Setup with /BECODERALLOWDATALOSS=1.
simplifiedChinese.SilentReplaceBlocked=静默覆盖需要明确的数据删除授权。请先导出 BeCoder 用户数据，再使用 /BECODERALLOWDATALOSS=1 重新运行安装程序。
english.ReplaceDeleteFailed=Setup could not completely remove the previous BeCoder installation. Close programs using this folder and try again.
simplifiedChinese.ReplaceDeleteFailed=安装程序无法完全删除旧版 BeCoder。请关闭正在使用此文件夹的程序，然后重试。
english.OwnershipMarkerFailed=Setup could not create the BeCoder ownership marker. Installation cannot continue safely.
simplifiedChinese.OwnershipMarkerFailed=安装程序无法创建 BeCoder 所有权标记。为确保安全，安装无法继续。
english.CreateDesktopShortcut=Create a desktop shortcut (not recommended when installing BeCoder on removable storage)
simplifiedChinese.CreateDesktopShortcut=创建桌面快捷方式（当你正在给可移动存储介质安装 BeCoder 时，不建议勾选）

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopShortcut}"; Flags: unchecked

[Files]
Source: "*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userdesktop}\{#NameLong}"; Filename: "{app}\{#ExeBasename}.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#ExeBasename}.exe"; Description: "{cm:LaunchProgram,{#NameLong}}"; Flags: nowait postinstall skipifsilent

[Code]
type
  TBeCoderGuid = record
    Data1: LongWord;
    Data2: Word;
    Data3: Word;
    Data4: array[0..7] of Byte;
  end;

const
  OwnershipMarkerName = '.becoder-installation.json';
  OwnershipMarkerPrefix = '{"schemaVersion":2,"product":"BeCoder","installationId":"';
  OwnershipMarkerSuffix = '"}';
  MaximumInstallPathLength = 70;
  LongPathBufferLength = 32768;
  FileAttributeReparsePoint = $00000400;
  InvalidFileAttributes = $FFFFFFFF;

var
  InstallationId: String;
  InstallationTarget: String;

function CoCreateGuid(var Guid: TBeCoderGuid): Integer;
  external 'CoCreateGuid@ole32.dll stdcall';

function GetFileAttributesW(lpFileName: String): LongWord;
  external 'GetFileAttributesW@kernel32.dll stdcall';

function GetLongPathNameW(lpszShortPath: String; lpszLongPath: String; cchBuffer: LongWord): LongWord;
  external 'GetLongPathNameW@kernel32.dll stdcall';

function IsHexDigit(const Value: Char): Boolean;
begin
  Result := ((Value >= '0') and (Value <= '9')) or
    ((Value >= 'a') and (Value <= 'f')) or
    ((Value >= 'A') and (Value <= 'F'));
end;

function IsValidInstallationId(const Value: String): Boolean;
var
  Index: Integer;
begin
  Result := Length(Value) = 36;
  if not Result then
    Exit;
  for Index := 1 to Length(Value) do
  begin
    if (Index = 9) or (Index = 14) or (Index = 19) or (Index = 24) then
      Result := Value[Index] = '-'
    else
      Result := IsHexDigit(Value[Index]);
    if not Result then
      Exit;
  end;
  Result := (Value[15] >= '1') and (Value[15] <= '5') and
    ((Value[20] = '8') or (Value[20] = '9') or (Value[20] = 'a') or
      (Value[20] = 'A') or (Value[20] = 'b') or (Value[20] = 'B'));
end;

function TryReadInstallationId(const Directory: String; var Value: String): Boolean;
var
  Contents: AnsiString;
  Marker: String;
begin
  Value := '';
  Result := LoadStringFromFile(AddBackslash(Directory) + OwnershipMarkerName, Contents);
  if not Result then
    Exit;
  Marker := String(Contents);
  Result := (Copy(Marker, 1, Length(OwnershipMarkerPrefix)) = OwnershipMarkerPrefix) and
    (Copy(Marker, Length(Marker) - Length(OwnershipMarkerSuffix) + 1, Length(OwnershipMarkerSuffix)) = OwnershipMarkerSuffix) and
    (Length(Marker) = Length(OwnershipMarkerPrefix) + 36 + Length(OwnershipMarkerSuffix));
  if not Result then
    Exit;
  Value := Copy(Marker, Length(OwnershipMarkerPrefix) + 1, 36);
  Result := IsValidInstallationId(Value);
end;

function CreateInstallationId(): String;
var
  Guid: TBeCoderGuid;
begin
  if CoCreateGuid(Guid) <> 0 then
    RaiseException('Setup could not create an installation identity.');
  Result := Lowercase(Format('%.8x-%.4x-%.4x-%.2x%.2x-%.2x%.2x%.2x%.2x%.2x%.2x', [
    Guid.Data1, Guid.Data2, Guid.Data3, Guid.Data4[0], Guid.Data4[1], Guid.Data4[2],
    Guid.Data4[3], Guid.Data4[4], Guid.Data4[5], Guid.Data4[6], Guid.Data4[7]
  ]));
end;

procedure SelectInstallationId(const Target: String);
var
  ExistingId: String;
begin
  if TryReadInstallationId(Target, ExistingId) then
  begin
    InstallationId := ExistingId;
    InstallationTarget := Target;
  end
  else if CompareText(InstallationTarget, Target) <> 0 then
  begin
    InstallationId := CreateInstallationId();
    InstallationTarget := Target;
  end;
end;

function OwnershipMarkerValue(): String;
begin
  Result := OwnershipMarkerPrefix + InstallationId + OwnershipMarkerSuffix;
end;

function NormalizedPath(const Value: String): String;
begin
  Result := RemoveBackslashUnlessRoot(ExpandFileName(Value));
end;

function IsDriveRoot(const Value: String): Boolean;
var
  Root: String;
begin
  Root := AddBackslash(ExtractFileDrive(NormalizedPath(Value)));
  Result := CompareText(AddBackslash(NormalizedPath(Value)), Root) = 0;
end;

function TryGetLongPathName(const Value: String; var LongPath: String): Boolean;
var
  RequiredLength: LongWord;
begin
  SetLength(LongPath, LongPathBufferLength);
  RequiredLength := GetLongPathNameW(Value, LongPath, LongPathBufferLength);
  Result := (RequiredLength > 0) and (RequiredLength < LongPathBufferLength);
  if Result then
    SetLength(LongPath, RequiredLength)
  else
    LongPath := '';
end;

function HasReparseAncestor(const Value: String): Boolean;
var
  Attributes: LongWord;
  Current: String;
  Parent: String;
begin
  Result := True;
  Current := NormalizedPath(Value);
  while True do
  begin
    Attributes := GetFileAttributesW(Current);
    if Attributes = InvalidFileAttributes then
      Exit;
    if (Attributes and FileAttributeReparsePoint) <> 0 then
      Exit;
    Parent := NormalizedPath(ExtractFileDir(Current));
    if CompareText(Parent, Current) = 0 then
      Break;
    Current := Parent;
  end;
  Result := False;
end;

function IsAsciiInstallPath(const Value: String): Boolean;
var
  Index: Integer;
begin
  Result := Length(Value) <= MaximumInstallPathLength;
  if not Result then
    Exit;
  for Index := 1 to Length(Value) do
  begin
    if Ord(Value[Index]) > 127 then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function TryResolveSupportedInstallPath(const Value: String; var Target: String): Boolean;
var
  Ancestor: String;
  CanonicalAncestor: String;
  LeafName: String;
  Parent: String;
  RelativeSuffix: String;
begin
  Result := False;
  Target := NormalizedPath(Value);
  Ancestor := Target;
  RelativeSuffix := '';
  while not DirExists(Ancestor) do
  begin
    if FileExists(Ancestor) then
      Exit;
    LeafName := ExtractFileName(Ancestor);
    Parent := NormalizedPath(ExtractFileDir(Ancestor));
    if (LeafName = '') or (CompareText(Parent, Ancestor) = 0) then
      Exit;
    if RelativeSuffix = '' then
      RelativeSuffix := LeafName
    else
      RelativeSuffix := LeafName + '\' + RelativeSuffix;
    Ancestor := Parent;
  end;
  if HasReparseAncestor(Ancestor) then
    Exit;
  if not TryGetLongPathName(Ancestor, CanonicalAncestor) then
    Exit;
  if RelativeSuffix <> '' then
    Target := NormalizedPath(AddBackslash(CanonicalAncestor) + RelativeSuffix)
  else
    Target := NormalizedPath(CanonicalAncestor);
  Result := IsAsciiInstallPath(Target);
end;

function DirectoryHasEntries(const Directory: String): Boolean;
var
  Entry: TFindRec;
begin
  Result := False;
  if FindFirst(AddBackslash(Directory) + '*', Entry) then
  begin
    try
      repeat
        if (Entry.Name <> '.') and (Entry.Name <> '..') then
        begin
          Result := True;
          Exit;
        end;
      until not FindNext(Entry);
    finally
      FindClose(Entry);
    end;
  end;
end;

function HasValidOwnershipMarker(const Directory: String): Boolean;
var
  ExistingId: String;
begin
  Result := TryReadInstallationId(Directory, ExistingId);
end;

function HasDataLossConsent(): Boolean;
var
  Index: Integer;
begin
  Result := False;
  for Index := 1 to ParamCount do
  begin
    if CompareText(ParamStr(Index), '/BECODERALLOWDATALOSS=1') = 0 then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Target: String;
begin
  Result := True;
  if CurPageID <> wpSelectDir then
    Exit;

  Target := NormalizedPath(WizardDirValue);
  if IsDriveRoot(Target) then
  begin
    SuppressibleMsgBox(ExpandConstant('{cm:UnsafeDirectory}'), mbError, MB_OK, IDOK);
    Result := False;
    Exit;
  end;
  if not TryResolveSupportedInstallPath(WizardDirValue, Target) then
  begin
    SuppressibleMsgBox(ExpandConstant('{cm:UnsupportedPath}'), mbError, MB_OK, IDOK);
    Result := False;
    Exit;
  end;
  if DirExists(Target) and DirectoryHasEntries(Target) and not HasValidOwnershipMarker(Target) then
  begin
    SuppressibleMsgBox(ExpandConstant('{cm:ForeignDirectory}'), mbError, MB_OK, IDOK);
    Result := False;
    Exit;
  end;
  SelectInstallationId(Target);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Target: String;
begin
  Result := '';
  Target := NormalizedPath(WizardDirValue);
  if IsDriveRoot(Target) then
  begin
    Result := ExpandConstant('{cm:UnsafeDirectory}');
    Exit;
  end;
  if not TryResolveSupportedInstallPath(WizardDirValue, Target) then
  begin
    Result := ExpandConstant('{cm:UnsupportedPath}');
    Exit;
  end;
  SelectInstallationId(Target);
  if not DirExists(Target) or not DirectoryHasEntries(Target) then
    Exit;
  if not HasValidOwnershipMarker(Target) then
  begin
    Result := ExpandConstant('{cm:ForeignDirectory}');
    Exit;
  end;
  if WizardSilent and not HasDataLossConsent() then
  begin
    Result := ExpandConstant('{cm:SilentReplaceBlocked}');
    Exit;
  end;
  if (not WizardSilent) and (MsgBox(ExpandConstant('{cm:ReplaceWarning}'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) <> IDYES) then
  begin
    Result := ExpandConstant('{cm:ReplaceWarning}');
    Exit;
  end;
	if not DelTree(Target, True, True, True) then
		Result := ExpandConstant('{cm:ReplaceDeleteFailed}');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
	if CurStep = ssPostInstall then
	begin
		if (InstallationId = '') or not SaveStringToFile(ExpandConstant('{app}\') + OwnershipMarkerName, OwnershipMarkerValue(), False) then
			RaiseException(ExpandConstant('{cm:OwnershipMarkerFailed}'));
	end;
end;
