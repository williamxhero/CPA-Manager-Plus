package worker

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	collectorpkg "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/collector"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
)

func TestCodexResetCreditAutoConsumeDecision(t *testing.T) {
	now := time.UnixMilli(1_800_000_000_000)
	count := int64(1)
	if !shouldAutoConsumeResetCredit(`{"reset_at":"1799999999000"}`, &count, now) {
		t.Fatal("due reset credit was not eligible for automatic consumption")
	}
	if shouldAutoConsumeResetCredit(`{"reset_at":"1800000001000"}`, &count, now) {
		t.Fatal("future reset credit was eligible for automatic consumption")
	}
	if shouldAutoConsumeResetCredit(`{"available_count":1}`, &count, now) {
		t.Fatal("reset credit without authoritative reset time was eligible")
	}
	if shouldAutoConsumeResetCredit(`{"reset_at":"1799999999000"}`, nil, now) {
		t.Fatal("reset credit without available count was eligible")
	}
}

func TestCodexResetCreditFetchFailsClosedWithoutCycle(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status_code":200,"body":{"rate_limit_reset_credits":{"available_count":1}}}`))
	}))
	defer server.Close()
	worker := NewCodexResetCreditWorker(st)
	_, err = worker.Fetch(context.Background(), collectorpkg.RuntimeConfig{CPAUpstreamURL: server.URL, ManagementKey: "test"}, CodexCredential{CredentialKey: "credential-a"})
	if err == nil {
		t.Fatal("Fetch unexpectedly accepted reset credits without a cycle")
	}
}

func TestCodexResetCreditConsumeRefreshesAroundConsume(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	var mu sync.Mutex
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		var response any = map[string]any{"rate_limit_reset_credits": map[string]any{"available_count": 1, "cycle_id": "cycle-a"}}
		if r.URL.Path == "/v0/management/api-call" {
			mu.Lock()
			paths = append(paths, body["url"].(string))
			index := len(paths)
			mu.Unlock()
			if index == 3 {
				response = map[string]any{"rate_limit_reset_credits": map[string]any{"available_count": 0, "cycle_id": "cycle-a"}}
			}
		}
		encoded, _ := json.Marshal(map[string]any{"status_code": 200, "body": response})
		_, _ = w.Write(encoded)
	}))
	defer server.Close()
	worker := NewCodexResetCreditWorker(st)
	cfg := collectorpkg.RuntimeConfig{CPAUpstreamURL: server.URL, ManagementKey: "test"}
	_, err = worker.Consume(context.Background(), cfg, CodexCredential{CredentialKey: "credential-a"})
	if err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(paths) != 5 || paths[0] != codexUsageURL || paths[1] != codexResetCreditsURL || paths[2] != codexResetCreditsConsumeURL || paths[3] != codexUsageURL || paths[4] != codexResetCreditsURL {
		t.Fatalf("unexpected CPA request sequence: %#v", paths)
	}
}
