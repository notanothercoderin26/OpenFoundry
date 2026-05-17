//go:build integration

package kernelgw

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// bootKernelGateway stands up jupyter/kernel-gateway with the
// notebook_http API. Mirrors the docker-compose snippet the dev
// environment uses.
func bootKernelGateway(ctx context.Context, t *testing.T) (httpURL string, wsURL string) {
	t.Helper()
	req := testcontainers.ContainerRequest{
		Image: "jupyter/kernel-gateway:2.5.2",
		Cmd: []string{
			"jupyter", "kernelgateway",
			"--KernelGatewayApp.ip=0.0.0.0",
			"--KernelGatewayApp.port=8888",
			"--KernelGatewayApp.api=kernel_gateway.notebook_http",
			"--KernelGatewayApp.auth_token=",
			"--KernelGatewayApp.allow_origin=*",
		},
		ExposedPorts: []string{"8888/tcp"},
		WaitingFor: wait.ForHTTP("/api/kernels").
			WithPort("8888/tcp").
			WithStartupTimeout(2 * time.Minute),
	}
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		t.Fatalf("start kernel-gateway: %v", err)
	}
	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = container.Terminate(shutdownCtx)
	})
	httpURL, err = container.PortEndpoint(ctx, "8888/tcp", "http")
	if err != nil {
		t.Fatalf("port endpoint: %v", err)
	}
	// Swap http→ws for the WS dial. The client does the same swap
	// internally when WSBaseURL is empty; we pass both explicitly here
	// to assert that path too.
	wsURL = "ws" + strings.TrimPrefix(httpURL, "http")
	return httpURL, wsURL
}

// TestIntegration_GatewayCreateExecuteDelete: end-to-end smoke against
// the real upstream image. Creates a kernel, runs `print(2+2)`, asserts
// the output stream contains "4", deletes the kernel.
func TestIntegration_GatewayCreateExecuteDelete(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test skipped in -short")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	httpURL, wsURL := bootKernelGateway(ctx, t)

	client, err := New(Config{HTTPBaseURL: httpURL, WSBaseURL: wsURL})
	if err != nil {
		t.Fatalf("client init: %v", err)
	}

	k, err := client.CreateKernel(ctx, "python3")
	if err != nil {
		t.Fatalf("create kernel: %v", err)
	}
	if k.ID == "" {
		t.Fatalf("expected kernel id, got %+v", k)
	}
	defer func() {
		_ = client.DeleteKernel(context.Background(), k.ID)
	}()

	out := make(chan OutputEvent, 64)
	execCtx, cancelExec := context.WithTimeout(ctx, 60*time.Second)
	defer cancelExec()

	errCh := make(chan error, 1)
	go func() {
		errCh <- client.Execute(execCtx, k.ID, "print(2+2)", out)
	}()

	var (
		sawStdout4 bool
		sawIdle    bool
	)
	for ev := range out {
		switch ev.Type {
		case "stdout":
			if strings.Contains(ev.Text, "4") {
				sawStdout4 = true
			}
		case "status":
			if ev.State == "idle" {
				sawIdle = true
			}
		case "error":
			t.Fatalf("upstream error: %+v", ev)
		}
	}
	if err := <-errCh; err != nil {
		t.Fatalf("execute: %v", err)
	}
	if !sawStdout4 {
		t.Fatalf("expected stdout containing 4")
	}
	if !sawIdle {
		t.Fatalf("expected terminal status=idle")
	}

	// List should include our kernel (or be empty if the gateway has
	// already collected it; just make sure the call works).
	if _, err := client.ListKernels(ctx); err != nil {
		t.Fatalf("list: %v", err)
	}

	if err := client.DeleteKernel(ctx, k.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
}
