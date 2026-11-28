package main

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() { gin.SetMode(gin.TestMode) }

func TestGetEnvUsesFallbackWhenUnset(t *testing.T) {
	t.Setenv("ASSESS_TEST_KEY", "")
	if got := getEnv("ASSESS_TEST_KEY", "fallback"); got != "fallback" {
		t.Fatalf("expected fallback, got %q", got)
	}
}

func TestGetEnvUsesValueWhenSet(t *testing.T) {
	t.Setenv("ASSESS_TEST_KEY", "value")
	if got := getEnv("ASSESS_TEST_KEY", "fallback"); got != "value" {
		t.Fatalf("expected value, got %q", got)
	}
}

func TestCorsPreflightReturns204(t *testing.T) {
	r := gin.New()
	r.Use(corsMiddleware())
	r.OPTIONS("/x", func(c *gin.Context) {})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodOptions, "/x", nil))
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
}

func TestCorsHeadersOnNormalRequest(t *testing.T) {
	r := gin.New()
	r.Use(corsMiddleware())
	r.GET("/x", func(c *gin.Context) { c.String(http.StatusOK, "ok") })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected CORS origin *, got %q", got)
	}
}

func TestHealthReturns503WhenDatabaseIsDown(t *testing.T) {
	var err error
	db, err = sql.Open("postgres", "postgres://u:p@127.0.0.1:1/d?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	r := gin.New()
	r.GET("/health", healthHandler)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/health", nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"status":"error"`) {
		t.Fatalf("unexpected body: %s", w.Body.String())
	}
}

func TestMetricsEndpointExposesRequestDuration(t *testing.T) {
	r := gin.New()
	r.Use(metricsMiddleware())
	r.GET("/x", func(c *gin.Context) { c.String(http.StatusOK, "ok") })
	r.GET("/metrics", metricsHandler())
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x", nil))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "http_request_duration_seconds") {
		t.Fatal("metrics output is missing http_request_duration_seconds")
	}
}
