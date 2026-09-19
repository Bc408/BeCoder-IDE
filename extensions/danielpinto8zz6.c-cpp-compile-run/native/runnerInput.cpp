/*
 * Copyright (c) 2026 BeCoder contributors.
 * Licensed under GPL-3.0-or-later; see ../LICENSE.
 */
#include<bits/stdc++.h>
#include<windows.h>
using namespace std;
struct handle {
  HANDLE value=nullptr;
  explicit handle(HANDLE x=nullptr):value(x) {}
  ~handle() { reset(); }
  handle(const handle&)=delete;
  handle& operator=(const handle&)=delete;
  void reset(HANDLE x=nullptr) {
    if (value && value!=INVALID_HANDLE_VALUE) CloseHandle(value);
    value=x;
  }
};
struct feeder {
  HANDLE file,pipe;
  DWORD error=0;
};
DWORD WINAPI feedInput(void *arg) {
  auto &state=*(feeder*)arg;
  char buffer[65536];
  DWORD count=0;
  for (;;) {
    if (!ReadFile(state.file,buffer,sizeof(buffer),&count,nullptr)) {
      state.error=GetLastError();
      break;
    }
    if (!count) break;
    DWORD offset=0;
    while (offset<count) {
      DWORD written=0;
      if (!WriteFile(state.pipe,buffer+offset,count-offset,&written,nullptr)) {
        DWORD code=GetLastError();
        if (code!=ERROR_BROKEN_PIPE && code!=ERROR_NO_DATA) state.error=code;
        CloseHandle(state.pipe);
        return 0;
      }
      offset+=written;
    }
  }
  //关闭唯一写端，空文件和无末尾换行的文件也必须产生真实 EOF。
  CloseHandle(state.pipe);
  return 0;
}
bool report(HANDLE pipe,const string &message) {
  string line=message+"\n";
  DWORD written=0;
  return WriteFile(pipe,line.data(),(DWORD)line.size(),&written,nullptr) && written==line.size();
}
int wmain(int argc,wchar_t **argv) {
  if (argc!=4) return 125;
  handle control(CreateFileW(argv[3],GENERIC_READ|GENERIC_WRITE,0,nullptr,OPEN_EXISTING,0,nullptr));
  if (control.value==INVALID_HANDLE_VALUE) return 125;
  auto fail=[&](const char *stage,DWORD code) {
    report(control.value,string("{\"type\":\"error\",\"stage\":\"")+stage+"\",\"code\":"+to_string(code)+"}");
    return 125;
  };
  handle input(CreateFileW(argv[2],GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr));
  if (input.value==INVALID_HANDLE_VALUE) return fail("input",GetLastError());
  handle job(CreateJobObjectW(nullptr,nullptr));
  if (!job.value) return fail("job",GetLastError());
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job.value,JobObjectExtendedLimitInformation,&limits,sizeof(limits))) return fail("job-limit",GetLastError());
  SECURITY_ATTRIBUTES security{sizeof(security),nullptr,TRUE};
  HANDLE reader=nullptr,writer=nullptr;
  if (!CreatePipe(&reader,&writer,&security,0)) return fail("pipe",GetLastError());
  handle readEnd(reader),writeEnd(writer);
  if (!SetHandleInformation(writer,HANDLE_FLAG_INHERIT,0)) return fail("pipe-inheritance",GetLastError());
  STARTUPINFOW startup{};
  startup.cb=sizeof(startup);
  startup.dwFlags=STARTF_USESTDHANDLES;
  startup.hStdInput=reader;
  startup.hStdOutput=GetStdHandle(STD_OUTPUT_HANDLE);
  startup.hStdError=GetStdHandle(STD_ERROR_HANDLE);
  PROCESS_INFORMATION child{};
  wstring command=L"\""+wstring(argv[1])+L"\"";
  //先挂起并加入作业，避免用户进程在被纳入回收范围前创建子进程。
  if (!CreateProcessW(argv[1],command.data(),nullptr,nullptr,TRUE,CREATE_SUSPENDED,nullptr,nullptr,&startup,&child)) return fail("create",GetLastError());
  handle process(child.hProcess),thread(child.hThread);
  if (!AssignProcessToJobObject(job.value,process.value)) {
    DWORD code=GetLastError();
    TerminateProcess(process.value,125);
    WaitForSingleObject(process.value,INFINITE);
    return fail("assign-job",code);
  }
  readEnd.reset();
  feeder state{input.value,writer};
  handle feederThread(CreateThread(nullptr,0,feedInput,&state,0,nullptr));
  if (!feederThread.value) {
    DWORD code=GetLastError();
    TerminateJobObject(job.value,125);
    WaitForSingleObject(process.value,INFINITE);
    return fail("feed-thread",code);
  }
  writeEnd.value=nullptr;
  if (!report(control.value,"{\"type\":\"started\",\"pid\":"+to_string(child.dwProcessId)+"}")) {
    TerminateJobObject(job.value,125);
    WaitForSingleObject(feederThread.value,INFINITE);
    return 125;
  }
  //等 BC 发布运行提示后再执行用户代码，控制握手不进入程序 stdin。
  char acknowledgement=0;
  DWORD received=0;
  if (!ReadFile(control.value,&acknowledgement,1,&received,nullptr) || received!=1 || acknowledgement!='G') {
    TerminateJobObject(job.value,125);
    WaitForSingleObject(feederThread.value,INFINITE);
    return 125;
  }
  if (ResumeThread(thread.value)==(DWORD)-1) {
    DWORD code=GetLastError();
    TerminateJobObject(job.value,125);
    WaitForSingleObject(feederThread.value,INFINITE);
    return fail("resume",code);
  }
  WaitForSingleObject(process.value,INFINITE);
  DWORD exitCode=125;
  bool gotExit=GetExitCodeProcess(process.value,&exitCode);
  DWORD exitError=GetLastError();
  //主程序已结束，回收残留子孙进程及输入管道读端，解除可能阻塞的写入。
  TerminateJobObject(job.value,exitCode);
  WaitForSingleObject(feederThread.value,INFINITE);
  if (!gotExit) return fail("exit-code",exitError);
  if (state.error) return fail("feed",state.error);
  if (!report(control.value,"{\"type\":\"exit\",\"code\":"+to_string(exitCode)+"}")) return 125;
  return (int)exitCode;
}
