package main

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var httpDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
	Name:    "http_request_duration_seconds",
	Help:    "HTTP request duration in seconds",
	Buckets: []float64{0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
}, []string{"method", "route", "status"})

func init() { prometheus.MustRegister(httpDuration) }

func metricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		httpDuration.WithLabelValues(c.Request.Method, route, strconv.Itoa(c.Writer.Status())).
			Observe(time.Since(start).Seconds())
	}
}

func metricsHandler() gin.HandlerFunc { return gin.WrapH(promhttp.Handler()) }
