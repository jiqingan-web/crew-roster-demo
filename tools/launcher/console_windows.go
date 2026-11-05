//go:build windows

package main

import "syscall"

func init() { // 控制台用 UTF-8 输出中文
	k := syscall.NewLazyDLL("kernel32.dll")
	k.NewProc("SetConsoleOutputCP").Call(65001)
	k.NewProc("SetConsoleTitleW").Call(uintptrOf("机组智能排班助手 · 演示版"))
}
