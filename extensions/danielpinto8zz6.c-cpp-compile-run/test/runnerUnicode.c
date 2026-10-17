/* Copyright (c) 2026 BeCoder contributors. GPL-3.0-or-later. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <conio.h>
#include <io.h>
#include <windows.h>

int main(void) {
  char name[64];
  printf("CP=%u,IN=%u\n", GetConsoleOutputCP(), GetConsoleCP());
  printf("学生成绩管理系统\n姓名：");
  fflush(stdout);
  if (scanf("%63s", name) != 1) return 3;
  printf("\nINPUT_HEX=");
  for (size_t i = 0; i < strlen(name); i++) printf("%02x", (unsigned char)name[i]);
  printf("\n");
  if (strcmp(name, "张三")) return 3;
  printf("\nINPUT_OK=%s\n", name);
  if (_isatty(0)) {
    printf("KEY_READY\n");
    fflush(stdout);
    if (getch() != 'x') return 4;
  }
  for (int i = 0; i < 3; i++) {
    system("cls");
    printf("学生成绩管理系统 %d\n请选择：", i);
    fflush(stdout);
    Sleep(30);
  }
  return 0;
}
