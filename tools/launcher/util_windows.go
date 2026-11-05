//go:build windows

package main

import ("syscall"; "unsafe")

func uintptrOf(s string) uintptr { p, _ := syscall.UTF16PtrFromString(s); return uintptr(unsafe.Pointer(p)) }
