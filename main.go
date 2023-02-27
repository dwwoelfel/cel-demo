package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"

	"net"
	"reflect"

	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/common/types"
	"github.com/google/cel-go/common/types/ref"

	requestpb "cel_demo/request"
)

/* Two things to do:
1. WAF mode that looks and acts like google cloud armor
   - Attributes: https://cloud.google.com/armor/docs/rules-language-reference#attributes
	 - Functions: https://cloud.google.com/armor/docs/rules-language-reference#operations
	 - allow, deny, and redirect rules
	 - list of rules evaluated in order, first matching rule is taken
2. Edge function mode that can do some of the things that Deno can do
*/

type Origin struct {
	Ip         string
	RegionCode string `json:"region_code"`
}

/* var originCelType = types.NewTypeValue("Origin", traits.ReceiverType) */

type Request struct {
	Headers map[string]string
	Method  string
	Path    string
	Scheme  string
	Query   string
}

// Is there some way to implement ocaml-like variants?
type Rule struct {
	Expression  string  `json:"expression"`
	Name        string  `json:"name"`
	Type        string  `json:"type"`
	StatusCode  *int    `json:"status_code,omitempty"`
	RedirectUrl *string `json:"redirect_url,omitempty"`
}

type TestPayload struct {
	Rules   []Rule
	Request Request
	Origin  Origin
}

type evalResult struct {
	cost    uint64
	matched bool
}

func checkRule(
	rule Rule,
	env cel.Env,
) (*cel.Ast, error) {
	ast, iss := env.Parse(rule.Expression)

	if iss.Err() != nil {
		return nil, iss.Err()
	}

	checked, iss := env.Check(ast)

	if iss.Err() != nil {
		return nil, iss.Err()
	}

	if !reflect.DeepEqual(checked.OutputType(), cel.BoolType) {
		return nil, fmt.Errorf(
			"invalid return type, got %v, wanted boolean",
			checked.OutputType(),
		)
	}

	return checked, nil
}

func evaluateRule(
	checked *cel.Ast,
	env cel.Env,
	vars any,
) (*evalResult, error) {
	program, err := env.Program(checked, cel.EvalOptions(cel.OptTrackCost))

	if err != nil {
		return nil, err
	}

	out, det, err := program.Eval(vars)

	if err != nil {
		return nil, err
	}

	result := evalResult{
		cost:    *det.ActualCost(),
		matched: out.Value().(bool),
	}

	return &result, nil
}

type InvalidRule struct {
	Rule  Rule   `json:"rule"`
	Error string `json:"error"`
}

type ExecutionError struct {
	Rule  Rule   `json:"rule"`
	Error string `json:"error"`
}

type Evaluation struct {
	Rule   Rule   `json:"rule"`
	Result bool   `json:"result"`
	Cost   uint64 `json:"cost"`
}

type TestResult struct {
	MatchedRule    *Rule           `json:"matched_rule"`
	InvalidRules   []InvalidRule   `json:"invalid_rules"`
	ExecutionError *ExecutionError `json:"execution_error"`
	Evaluations    []Evaluation    `json:"evaluations"`
}

func testHandler(w http.ResponseWriter, r *http.Request) {

	payload := TestPayload{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.WriteHeader(400)
		fmt.Fprintf(w, "Invalid body %v", err)
		return
	}

	celEnv, err := cel.NewEnv(
		cel.Types(&requestpb.Origin{}),
		cel.Types(&requestpb.Request{}),
		cel.Variable("origin", cel.ObjectType("cel_demo.request.Origin")),
		cel.Variable("request", cel.ObjectType("cel_demo.request.Request")),
		cel.Function(
			"ipInRange",
			cel.Overload("ipInRange_string_string",
				[]*cel.Type{cel.StringType, cel.StringType},
				cel.BoolType,
				cel.BinaryBinding(func(ipVal, ipRangeVal ref.Val) ref.Val {
					ipString, ok := ipVal.Value().(string)
					if !ok {
						return types.NewErr(fmt.Sprintf("%v is not a valid ip", ipVal))
					}
					ip := net.ParseIP(ipString)
					if ip == nil {
						return types.NewErr(fmt.Sprintf("%v is not a valid ip", ipVal))
					}
					ipRangeString, range_ok := ipRangeVal.Value().(string)
					if !range_ok {
						return types.NewErr(fmt.Sprintf("%v is not a valid range", ipRangeVal))
					}
					_, ipRange, err := net.ParseCIDR(ipRangeString)
					if err != nil {
						return types.NewErr(fmt.Sprintf("%v is not a valid range", ipRangeVal))
					}
					return types.Bool(ipRange.Contains(ip))
				}),
			),
		),
	)

	if err != nil {
		w.WriteHeader(500)
		fmt.Fprintf(w, "Internal error %v", err)
		return
	}

	vars := map[string]any{
		"request": &requestpb.Request{
			Headers: payload.Request.Headers,
			Method:  payload.Request.Method,
			Path:    payload.Request.Path,
			Scheme:  payload.Request.Scheme,
			Query:   payload.Request.Query,
		},
		"origin": &requestpb.Origin{
			Ip:         payload.Origin.Ip,
			RegionCode: payload.Origin.RegionCode,
		},
	}

	asts := make(map[string]*cel.Ast, 0)

	invalidRules := make([]InvalidRule, 0)

	for _, rule := range payload.Rules {
		checked, err := checkRule(rule, *celEnv)
		if err != nil {
			invalidRules = append(invalidRules, InvalidRule{
				Rule:  rule,
				Error: err.Error(),
			})
		} else {
			asts[rule.Name] = checked
		}
	}

	testResult := TestResult{}

	evaluations := make([]Evaluation, 0)

	if len(invalidRules) > 0 {
		testResult.InvalidRules = invalidRules
	} else {
		for _, rule := range payload.Rules {
			checked := asts[rule.Name]
			res, err := evaluateRule(checked, *celEnv, vars)
			if err != nil {
				testResult.ExecutionError = &ExecutionError{
					Rule:  rule,
					Error: err.Error(),
				}
				break
			}
			evaluations = append(evaluations, Evaluation{
				Rule:   rule,
				Result: res.matched,
				Cost:   res.cost,
			})
			if res.matched {
				testResult.MatchedRule = &rule
				break
			}
		}
	}

	testResult.Evaluations = evaluations

	res, err := json.Marshal(&testResult)

	if err != nil {
		w.WriteHeader(500)
		fmt.Fprintf(w, "Internal error %v", err)
		return
	}

	w.WriteHeader(200)
	fmt.Fprintf(w, "%s", res)
}

//go:embed frontend/build/* frontend/build/static/* frontend/build/static/js/* frontend/build/static/css/*
var staticFS embed.FS

func main() {
	log.Print("starting server...")
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds | log.LstdFlags | log.Lshortfile)

	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	fs := http.FileServer(http.FS(staticFS))

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		rctx := chi.RouteContext(r.Context())
		pathPrefix := strings.TrimSuffix(rctx.RoutePattern(), "/*")
		log.Println(pathPrefix, rctx.RoutePattern(), r.URL.Path)

		rcopy := r.Clone(r.Context())
		rcopy.URL.Path = "frontend/build" + r.URL.Path

		fs.ServeHTTP(w, rcopy)
	})

	r.Post("/test", testHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8089"
	}

	_, ipRange, _ := net.ParseCIDR("9.9.9.0/24")

	ip := net.ParseIP("9.9.10.1")

	log.Println("CONTAINS", ipRange.Contains(ip))

	var addr string
	if os.Getenv("ENV") == "production" {
		addr = fmt.Sprintf(":%s", port)

	} else {
		addr = fmt.Sprintf("127.0.0.1:%s", port)
	}
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, r))
}
