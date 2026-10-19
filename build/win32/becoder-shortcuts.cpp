/*
 * Copyright (c) 2026 BeCoder contributors.
 * Licensed under GPL-3.0-or-later; see ../../LICENSE.
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <algorithm>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#ifndef BECODER_SHORTCUT_NAME
#define BECODER_SHORTCUT_NAME L"BeCoder"
#endif

namespace {
constexpr DWORD maximumLinkBytes = 1024 * 1024;
constexpr GUID shellLinkClass = {0x00021401, 0, 0, {0xc0, 0, 0, 0, 0, 0, 0, 0x46}};
constexpr GUID commonProgramsId = {0x0139d44e, 0x6afe, 0x49f2, {0x86, 0x90, 0x3d, 0xaf, 0xca, 0xe6, 0xff, 0xb8}};
constexpr GUID userProgramsId = {0xa77f5d77, 0x2e2b, 0x44c3, {0xa6, 0xa2, 0xab, 0xa6, 0x01, 0x05, 0x4a, 0x51}};

struct Handle {
	HANDLE value;
	explicit Handle(HANDLE handle) : value(handle) {}
	~Handle() { if (value != INVALID_HANDLE_VALUE) { CloseHandle(value); } }
	Handle(const Handle&) = delete;
	Handle& operator=(const Handle&) = delete;
};

template<typename T> struct ComPointer {
	T* value = nullptr;
	~ComPointer() { if (value) { value->Release(); } }
	T** address() { return &value; }
	T* operator->() const { return value; }
};

// The bundled competition toolchain intentionally omits ole32 import libraries.
// Load only the operating system's COM implementation, never an app-local DLL.
struct ComApi {
	HMODULE module = LoadLibraryExW(L"ole32.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
	decltype(&CoInitializeEx) initialize = nullptr;
	decltype(&CoUninitialize) uninitialize = nullptr;
	decltype(&CoCreateInstance) create = nullptr;
	decltype(&CreateStreamOnHGlobal) stream = nullptr;
	decltype(&CoTaskMemFree) freeMemory = nullptr;
	bool initialized = false;
	template<typename T> void load(T& function, const char* name) {
		FARPROC address = GetProcAddress(module, name);
		static_assert(sizeof(function) == sizeof(address));
		std::memcpy(&function, &address, sizeof(function));
	}
	ComApi() {
		if (!module) { return; }
		load(initialize, "CoInitializeEx");
		load(uninitialize, "CoUninitialize");
		load(create, "CoCreateInstance");
		load(stream, "CreateStreamOnHGlobal");
		load(freeMemory, "CoTaskMemFree");
		initialized = initialize && uninitialize && create && stream && freeMemory && SUCCEEDED(initialize(nullptr, COINIT_APARTMENTTHREADED));
	}
	~ComApi() {
		if (initialized) { uninitialize(); }
		if (module) { FreeLibrary(module); }
	}
};

DWORD errorFromResult(HRESULT result) {
	return HRESULT_FACILITY(result) == FACILITY_WIN32 ? HRESULT_CODE(result) : ERROR_INVALID_DATA;
}

bool fullPath(const std::wstring& input, std::wstring& output) {
	wchar_t buffer[32768];
	DWORD count = GetFullPathNameW(input.c_str(), ARRAYSIZE(buffer), buffer, nullptr);
	if (!count || count >= ARRAYSIZE(buffer)) { return false; }
	output.assign(buffer, count);
	while (output.size() > 3 && output.back() == L'\\') { output.pop_back(); }
	return true;
}

bool samePath(const std::wstring& left, const std::wstring& right) {
	std::wstring a, b;
	return fullPath(left, a) && fullPath(right, b) && _wcsicmp(a.c_str(), b.c_str()) == 0;
}

DWORD lockDirectories(const std::wstring& path, std::vector<std::unique_ptr<Handle>>& handles) {
	if (path.size() < 3 || path[1] != L':' || path[2] != L'\\') { return ERROR_INVALID_NAME; }
	for (size_t end = 3;;) {
		std::wstring current = path.substr(0, end);
		auto handle = std::make_unique<Handle>(CreateFileW(current.c_str(), FILE_READ_ATTRIBUTES,
			FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
			FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
		if (handle->value == INVALID_HANDLE_VALUE) { return GetLastError(); }
		BY_HANDLE_FILE_INFORMATION info{};
		if (!GetFileInformationByHandle(handle->value, &info)) { return GetLastError(); }
		if (!(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) || (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) { return ERROR_INVALID_NAME; }
		handles.push_back(std::move(handle));
		if (end == path.size()) { break; }
		end = path.find(L'\\', end + (end == 3 ? 0 : 1));
		if (end == std::wstring::npos) { end = path.size(); }
	}
	return ERROR_SUCCESS;
}

DWORD programsDirectory(ComApi& api, bool legacy, std::wstring& directory) {
#ifdef BECODER_SHORTCUT_TESTING
	(void)api;
	wchar_t testDirectory[32768];
	DWORD count = GetEnvironmentVariableW(legacy ? L"BECODER_SHORTCUT_TEST_USER_PROGRAMS" : L"BECODER_SHORTCUT_TEST_PROGRAMS", testDirectory, ARRAYSIZE(testDirectory));
	if (count && count < ARRAYSIZE(testDirectory)) { return fullPath(testDirectory, directory) ? ERROR_SUCCESS : ERROR_INVALID_NAME; }
	return ERROR_INVALID_PARAMETER; // Test binaries must never fall through to a real Start menu.
#else
	PWSTR result = nullptr;
	HRESULT status = SHGetKnownFolderPath(legacy ? userProgramsId : commonProgramsId, KF_FLAG_DONT_VERIFY, nullptr, &result);
	if (FAILED(status)) { return errorFromResult(status); }
	bool valid = fullPath(result, directory);
	api.freeMemory(result);
	return valid ? ERROR_SUCCESS : ERROR_INVALID_NAME;
#endif
}

DWORD newLink(ComApi& api, ComPointer<IShellLinkW>& link) {
	HRESULT result = api.create(shellLinkClass, nullptr, CLSCTX_INPROC_SERVER, __uuidof(IShellLinkW), reinterpret_cast<void**>(link.address()));
	return SUCCEEDED(result) ? ERROR_SUCCESS : errorFromResult(result);
}

DWORD streamForLink(ComApi& api, ComPointer<IShellLinkW>& link, ComPointer<IStream>& stream, ComPointer<IPersistStream>& persist) {
	HRESULT result = api.stream(nullptr, TRUE, stream.address());
	if (SUCCEEDED(result)) { result = link->QueryInterface(__uuidof(IPersistStream), reinterpret_cast<void**>(persist.address())); }
	return SUCCEEDED(result) ? ERROR_SUCCESS : errorFromResult(result);
}

DWORD ownedLink(ComApi& api, HANDLE file, const std::wstring& root) {
	BY_HANDLE_FILE_INFORMATION info{};
	if (!GetFileInformationByHandle(file, &info)) { return GetLastError(); }
	if ((info.dwFileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY)) || info.nNumberOfLinks != 1 || info.nFileSizeHigh || !info.nFileSizeLow || info.nFileSizeLow > maximumLinkBytes) { return ERROR_ALREADY_EXISTS; }
	std::vector<BYTE> bytes(info.nFileSizeLow);
	DWORD read = 0;
	if (!ReadFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &read, nullptr) || read != bytes.size()) { return ERROR_INVALID_DATA; }
	ComPointer<IShellLinkW> link;
	DWORD error = newLink(api, link);
	if (error) { return error; }
	ComPointer<IStream> stream;
	ComPointer<IPersistStream> persist;
	if ((error = streamForLink(api, link, stream, persist))) { return error; }
	ULONG written = 0;
	LARGE_INTEGER zero{};
	if (FAILED(stream->Write(bytes.data(), static_cast<ULONG>(bytes.size()), &written)) || written != bytes.size() || FAILED(stream->Seek(zero, STREAM_SEEK_SET, nullptr)) || FAILED(persist->Load(stream.value))) { return ERROR_ALREADY_EXISTS; }
	wchar_t target[32768], working[32768], arguments[32768];
	if (FAILED(link->GetPath(target, ARRAYSIZE(target), nullptr, SLGP_RAWPATH)) || FAILED(link->GetWorkingDirectory(working, ARRAYSIZE(working))) || FAILED(link->GetArguments(arguments, ARRAYSIZE(arguments)))) { return ERROR_ALREADY_EXISTS; }
	return !arguments[0] && samePath(target, root + L"\\BeCoder.exe") && samePath(working, root) ? ERROR_SUCCESS : ERROR_ALREADY_EXISTS;
}

DWORD serializeLink(ComApi& api, const std::wstring& root, std::vector<BYTE>& bytes) {
	ComPointer<IShellLinkW> link;
	DWORD error = newLink(api, link);
	if (error) { return error; }
	const std::wstring executable = root + L"\\BeCoder.exe";
	HRESULT result = link->SetPath(executable.c_str());
	if (SUCCEEDED(result)) { result = link->SetWorkingDirectory(root.c_str()); }
	if (SUCCEEDED(result)) { result = link->SetDescription(L"BeCoder"); }
	if (SUCCEEDED(result)) { result = link->SetIconLocation(executable.c_str(), 0); }
	if (SUCCEEDED(result)) { result = link->SetShowCmd(SW_SHOWNORMAL); }
	if (FAILED(result)) { return errorFromResult(result); }
	ComPointer<IStream> stream;
	ComPointer<IPersistStream> persist;
	if ((error = streamForLink(api, link, stream, persist))) { return error; }
	STATSTG info{};
	LARGE_INTEGER zero{};
	if (FAILED(persist->Save(stream.value, TRUE)) || FAILED(stream->Stat(&info, STATFLAG_NONAME)) || info.cbSize.QuadPart > maximumLinkBytes || !info.cbSize.QuadPart || FAILED(stream->Seek(zero, STREAM_SEEK_SET, nullptr))) { return ERROR_INVALID_DATA; }
	bytes.resize(static_cast<size_t>(info.cbSize.QuadPart));
	ULONG read = 0;
	return SUCCEEDED(stream->Read(bytes.data(), static_cast<ULONG>(bytes.size()), &read)) && read == bytes.size() ? ERROR_SUCCESS : ERROR_INVALID_DATA;
}

DWORD applyShortcut(ComApi& api, const std::wstring& action, const std::wstring& root) {
	const bool legacy = action == L"remove-legacy";
	const bool create = action == L"create";
	std::wstring directory;
	DWORD error = programsDirectory(api, legacy, directory);
	if (error) { return error; }
	if (legacy) { directory += L"\\" BECODER_SHORTCUT_NAME; }
	std::vector<std::unique_ptr<Handle>> directories;
	if ((error = lockDirectories(directory, directories))) { return !create && (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND) ? ERROR_SUCCESS : error; }
	const std::wstring filename = directory + L"\\" BECODER_SHORTCUT_NAME L".lnk";
	Handle existing(CreateFileW(filename.c_str(), GENERIC_READ | (create ? 0 : DELETE), FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
	if (existing.value != INVALID_HANDLE_VALUE) {
		if ((error = ownedLink(api, existing.value, root))) { return error; }
		if (create) { return ERROR_SUCCESS; }
		FILE_DISPOSITION_INFO disposition{TRUE};
		return SetFileInformationByHandle(existing.value, FileDispositionInfo, &disposition, sizeof(disposition)) ? ERROR_SUCCESS : GetLastError();
	}
	error = GetLastError();
	if (error != ERROR_FILE_NOT_FOUND) { return error; }
	if (!create) { return ERROR_SUCCESS; }
	std::vector<BYTE> bytes;
	if ((error = serializeLink(api, root, bytes))) { return error; }
	Handle file(CreateFileW(filename.c_str(), GENERIC_WRITE | DELETE, FILE_SHARE_READ, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
	if (file.value == INVALID_HANDLE_VALUE) { return GetLastError(); }
	DWORD written = 0;
	if (WriteFile(file.value, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr) && written == bytes.size() && FlushFileBuffers(file.value)) { return ERROR_SUCCESS; }
	error = GetLastError();
	FILE_DISPOSITION_INFO disposition{TRUE};
	if (!SetFileInformationByHandle(file.value, FileDispositionInfo, &disposition, sizeof(disposition))) { return ERROR_WRITE_FAULT; }
	return error ? error : ERROR_WRITE_FAULT;
}
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
	int count = 0;
	LPWSTR* arguments = CommandLineToArgvW(GetCommandLineW(), &count);
	if (!arguments) { return ERROR_INVALID_PARAMETER; }
	std::wstring action = count == 3 ? arguments[1] : L"";
	std::wstring root;
	bool valid = count == 3 && (action == L"create" || action == L"remove" || action == L"remove-legacy") && fullPath(arguments[2], root);
	LocalFree(arguments);
	if (!valid || root.size() <= 3 || root.size() > 70 || root[1] != L':' || root[2] != L'\\' || std::any_of(root.begin(), root.end(), [](wchar_t c) { return c > 127; })) { return ERROR_INVALID_PARAMETER; }
	std::vector<std::unique_ptr<Handle>> directories;
	DWORD error = lockDirectories(root, directories);
	if (error) { return static_cast<int>(error); }
	ComApi api;
	return static_cast<int>(api.initialized ? applyShortcut(api, action, root) : ERROR_DLL_INIT_FAILED);
}
