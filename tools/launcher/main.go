// 机组智能排班助手 · 演示版启动器：内嵌全部网页文件，本机起一个只监听 127.0.0.1 的服务并打开浏览器；完全离线。
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"time"
)

//go:embed app
var appFS embed.FS

func openBrowser(url string) {
	switch runtime.GOOS {
	case "windows":
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		exec.Command("open", url).Start()
	default:
		exec.Command("xdg-open", url).Start()
	}
}

func main() {
	sub, _ := fs.Sub(appFS, "app")
	mux := http.NewServeMux()
	fsrv := http.FileServer(http.FS(sub))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" { http.Redirect(w, r, "/show/", http.StatusFound); return }
		w.Header().Set("Cache-Control", "no-store")
		fsrv.ServeHTTP(w, r)
	})
	// 固定端口，浏览器里保存的排班数据（localStorage）才能在下次打开时还在；被占用则换随机端口
	ln, err := net.Listen("tcp", "127.0.0.1:17321")
	if err != nil { ln, err = net.Listen("tcp", "127.0.0.1:0"); if err != nil { fmt.Println("启动失败：", err); time.Sleep(10 * time.Second); return } }
	url := fmt.Sprintf("http://%s/show/", ln.Addr().String())
	fmt.Println("机组智能排班助手 · 演示版")
	fmt.Println("已在浏览器打开：", url)
	fmt.Println("（浏览器没有自动打开时，复制上面的地址到 Chrome / Edge）")
	fmt.Println("演示期间请保持本窗口打开；关闭本窗口即退出程序。")
	go func() { time.Sleep(400 * time.Millisecond); openBrowser(url) }()
	http.Serve(ln, mux)
}
