package logicexec

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// evaluateCalculator evaluates a Foundry "calculator" expression.
// Variables resolve from inputs (any numeric type). Supported syntax:
// numbers, identifiers, +, -, *, /, parentheses. Anything outside
// that surface returns an error the caller surfaces as a tool
// observation — Foundry's calculator tool is deliberately narrow so
// the LLM cannot smuggle code execution through it.
func evaluateCalculator(expression string, inputs map[string]any) (float64, error) {
	expression = strings.TrimSpace(expression)
	if expression == "" {
		return 0, fmt.Errorf("calculator expression is empty")
	}
	p := &calcParser{src: expression, inputs: inputs}
	p.next()
	value, err := p.parseExpression()
	if err != nil {
		return 0, err
	}
	if p.tok.kind != tokEOF {
		return 0, fmt.Errorf("unexpected trailing token %q", p.tok.text)
	}
	return value, nil
}

type calcToken struct {
	kind int
	text string
}

const (
	tokEOF = iota
	tokNumber
	tokIdent
	tokPlus
	tokMinus
	tokMul
	tokDiv
	tokLParen
	tokRParen
)

type calcParser struct {
	src    string
	pos    int
	tok    calcToken
	inputs map[string]any
}

func (p *calcParser) next() {
	for p.pos < len(p.src) && unicode.IsSpace(rune(p.src[p.pos])) {
		p.pos++
	}
	if p.pos >= len(p.src) {
		p.tok = calcToken{kind: tokEOF}
		return
	}
	c := p.src[p.pos]
	switch {
	case c == '+':
		p.pos++
		p.tok = calcToken{kind: tokPlus, text: "+"}
	case c == '-':
		p.pos++
		p.tok = calcToken{kind: tokMinus, text: "-"}
	case c == '*':
		p.pos++
		p.tok = calcToken{kind: tokMul, text: "*"}
	case c == '/':
		p.pos++
		p.tok = calcToken{kind: tokDiv, text: "/"}
	case c == '(':
		p.pos++
		p.tok = calcToken{kind: tokLParen, text: "("}
	case c == ')':
		p.pos++
		p.tok = calcToken{kind: tokRParen, text: ")"}
	case c == '.' || (c >= '0' && c <= '9'):
		start := p.pos
		seenDot := false
		for p.pos < len(p.src) {
			d := p.src[p.pos]
			if d == '.' && !seenDot {
				seenDot = true
				p.pos++
				continue
			}
			if d >= '0' && d <= '9' {
				p.pos++
				continue
			}
			break
		}
		p.tok = calcToken{kind: tokNumber, text: p.src[start:p.pos]}
	case isIdentStart(rune(c)):
		start := p.pos
		for p.pos < len(p.src) && isIdentCont(rune(p.src[p.pos])) {
			p.pos++
		}
		p.tok = calcToken{kind: tokIdent, text: p.src[start:p.pos]}
	default:
		p.tok = calcToken{kind: tokEOF, text: string(c)}
	}
}

func isIdentStart(r rune) bool { return r == '_' || unicode.IsLetter(r) }
func isIdentCont(r rune) bool  { return r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r) }

// parseExpression: term (('+' | '-') term)*
func (p *calcParser) parseExpression() (float64, error) {
	value, err := p.parseTerm()
	if err != nil {
		return 0, err
	}
	for p.tok.kind == tokPlus || p.tok.kind == tokMinus {
		op := p.tok.kind
		p.next()
		rhs, err := p.parseTerm()
		if err != nil {
			return 0, err
		}
		if op == tokPlus {
			value += rhs
		} else {
			value -= rhs
		}
	}
	return value, nil
}

// parseTerm: factor (('*' | '/') factor)*
func (p *calcParser) parseTerm() (float64, error) {
	value, err := p.parseFactor()
	if err != nil {
		return 0, err
	}
	for p.tok.kind == tokMul || p.tok.kind == tokDiv {
		op := p.tok.kind
		p.next()
		rhs, err := p.parseFactor()
		if err != nil {
			return 0, err
		}
		if op == tokMul {
			value *= rhs
		} else {
			if rhs == 0 {
				return 0, fmt.Errorf("calculator: division by zero")
			}
			value /= rhs
		}
	}
	return value, nil
}

// parseFactor: ('-' | '+')? primary
func (p *calcParser) parseFactor() (float64, error) {
	sign := 1.0
	for p.tok.kind == tokMinus || p.tok.kind == tokPlus {
		if p.tok.kind == tokMinus {
			sign = -sign
		}
		p.next()
	}
	value, err := p.parsePrimary()
	if err != nil {
		return 0, err
	}
	return sign * value, nil
}

// parsePrimary: number | ident | '(' expression ')'
func (p *calcParser) parsePrimary() (float64, error) {
	switch p.tok.kind {
	case tokNumber:
		value, err := strconv.ParseFloat(p.tok.text, 64)
		if err != nil {
			return 0, fmt.Errorf("calculator: invalid number %q", p.tok.text)
		}
		p.next()
		return value, nil
	case tokIdent:
		name := p.tok.text
		p.next()
		raw, ok := p.inputs[name]
		if !ok {
			return 0, fmt.Errorf("calculator: undefined variable %q", name)
		}
		value, err := coerceNumber(raw)
		if err != nil {
			return 0, fmt.Errorf("calculator: variable %q is not numeric (%w)", name, err)
		}
		return value, nil
	case tokLParen:
		p.next()
		value, err := p.parseExpression()
		if err != nil {
			return 0, err
		}
		if p.tok.kind != tokRParen {
			return 0, fmt.Errorf("calculator: missing closing parenthesis")
		}
		p.next()
		return value, nil
	}
	return 0, fmt.Errorf("calculator: unexpected token %q", p.tok.text)
}

func coerceNumber(raw any) (float64, error) {
	switch v := raw.(type) {
	case float64:
		return v, nil
	case float32:
		return float64(v), nil
	case int:
		return float64(v), nil
	case int32:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case string:
		return strconv.ParseFloat(strings.TrimSpace(v), 64)
	default:
		return 0, fmt.Errorf("unsupported type %T", raw)
	}
}
