package models

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestNormaliseNameCollapsesWhitespace(t *testing.T) {
	in := "  Sales\tForecast \n Module  "
	got := NormaliseName(in)
	want := "Sales Forecast Module"
	if got != want {
		t.Fatalf("NormaliseName = %q, want %q", got, want)
	}
}

func TestNormaliseNameEmptyStaysEmpty(t *testing.T) {
	if NormaliseName("   \t\n") != "" {
		t.Fatal("expected blank input to normalise to empty string")
	}
}

func TestCreateParamsValidate(t *testing.T) {
	actor := uuid.New()
	project := uuid.New()

	cases := []struct {
		name    string
		mutate  func(p *CreateParams)
		wantErr string
	}{
		{
			name:   "happy_path",
			mutate: func(p *CreateParams) {},
		},
		{
			name:    "missing_name",
			mutate:  func(p *CreateParams) { p.Name = " \t" },
			wantErr: "name",
		},
		{
			name:    "long_name",
			mutate:  func(p *CreateParams) { p.Name = strings.Repeat("a", 200) },
			wantErr: "name",
		},
		{
			name:    "bad_execution_mode",
			mutate:  func(p *CreateParams) { p.ExecutionMode = "container" },
			wantErr: "execution_mode",
		},
		{
			name:    "zero_project",
			mutate:  func(p *CreateParams) { p.ProjectID = uuid.Nil },
			wantErr: "project_id",
		},
		{
			name: "zero_folder",
			mutate: func(p *CreateParams) {
				z := uuid.Nil
				p.FolderID = &z
			},
			wantErr: "folder_id",
		},
		{
			name:    "missing_actor",
			mutate:  func(p *CreateParams) { p.Actor = uuid.Nil },
			wantErr: "actor",
		},
		{
			name: "too_many_labels",
			mutate: func(p *CreateParams) {
				labels := make(map[string]string, 33)
				for i := 0; i < 33; i++ {
					labels[string(rune('a'+i))+"-key"] = "v"
				}
				p.Labels = labels
			},
			wantErr: "labels",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			p := CreateParams{
				Name:          "Forecast Pipeline",
				Description:   "demo",
				ProjectID:     project,
				ExecutionMode: ExecutionModeFunction,
				Actor:         actor,
			}
			tc.mutate(&p)
			err := p.Validate()
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.wantErr)
			}
			var ve *ValidationError
			if !errorsAs(err, &ve) {
				t.Fatalf("expected ValidationError, got %T (%v)", err, err)
			}
			if ve.Field != tc.wantErr {
				t.Fatalf("field = %q, want %q (msg=%q)", ve.Field, tc.wantErr, ve.Msg)
			}
		})
	}
}

func TestUpdateMetadataRequiresAtLeastOneField(t *testing.T) {
	p := UpdateMetadataParams{Actor: uuid.New()}
	if err := p.Validate(); err == nil {
		t.Fatal("expected validation error for empty patch")
	}
}

func TestUpdateMetadataNormalisesName(t *testing.T) {
	name := "   New   name "
	p := UpdateMetadataParams{Name: &name, Actor: uuid.New()}
	if err := p.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if *p.Name != "New name" {
		t.Fatalf("name was not normalised: %q", *p.Name)
	}
}

func TestExecutionModeIsValid(t *testing.T) {
	if !ExecutionModeFunction.IsValid() || !ExecutionModePipeline.IsValid() {
		t.Fatal("canonical modes should validate")
	}
	if ExecutionMode("").IsValid() || ExecutionMode("container").IsValid() {
		t.Fatal("invalid modes should not validate")
	}
}

// errorsAs is a tiny shim so the test stays std-lib only.
func errorsAs(err error, target **ValidationError) bool {
	ve, ok := err.(*ValidationError)
	if !ok {
		return false
	}
	*target = ve
	return true
}
