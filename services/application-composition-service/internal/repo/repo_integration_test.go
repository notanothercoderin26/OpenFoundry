//go:build integration

// Integration tests for the branch-aware app repository (B01 Fase 1).
// Boots a real postgres:16-alpine container via libs/testing and applies
// the embedded Goose-style migrations. Validates:
//
//  1. Two apps with the same slug on different branches coexist.
//  2. ListApps filters by branch and counts correctly.
//  3. PublishApp creates a version with the parent app's branch.
//  4. Same slug on `main` and `geo-poc` produce different IDs.
//  5. NormalizeAppContract surfaces a *models.ValidationError with the
//     dotted Path so the handler can map failures back to widget nodes.
package repo

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	testingx "github.com/openfoundry/openfoundry-go/libs/testing"
	"github.com/openfoundry/openfoundry-go/services/application-composition-service/internal/models"
)

func TestAppRepo_BranchIsolation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	harness := testingx.BootPostgres(ctx, t)
	require.NoError(t, Migrate(ctx, harness.Pool))

	r := &Repo{Pool: harness.Pool}
	creator := uuid.New()

	mainApp, err := r.CreateApp(ctx, &models.CreateAppRequest{
		Name:        "Geopolitical Intel Workbench",
		Slug:        "geo-intel",
		Description: "Stable main-branch app",
		Pages:       json.RawMessage(`[{"id":"main","name":"Main","path":"/","layout":{"kind":"grid","columns":12},"widgets":[],"visible":true}]`),
	}, &creator)
	require.NoError(t, err)
	require.Equal(t, models.DefaultAppBranch, mainApp.Branch,
		"empty branch in request must default to main")

	pocApp, err := r.CreateApp(ctx, &models.CreateAppRequest{
		Name:        "Geopolitical Intel Workbench (PoC)",
		Slug:        "geo-intel", // same slug, different branch
		Branch:      "geo-poc",
		Description: "Experimental branch app",
		Pages:       json.RawMessage(`[{"id":"main","name":"Main","path":"/","layout":{"kind":"grid","columns":12},"widgets":[],"visible":true}]`),
	}, &creator)
	require.NoError(t, err, "same slug on different branch must succeed")
	require.NotEqual(t, mainApp.ID, pocApp.ID,
		"each branch produces its own app row")
	require.Equal(t, "geo-poc", pocApp.Branch)

	// A second app on the same (slug, branch) must collide.
	_, err = r.CreateApp(ctx, &models.CreateAppRequest{
		Name: "Duplicate",
		Slug: "geo-intel",
		// no branch → defaults to main → collides with mainApp.
		Pages: json.RawMessage(`[]`),
	}, &creator)
	require.Error(t, err, "duplicate (slug, branch) must be rejected by the UNIQUE index")

	// GetAppBySlug honours the branch query.
	gotMain, err := r.GetAppBySlug(ctx, "geo-intel", models.DefaultAppBranch)
	require.NoError(t, err)
	require.NotNil(t, gotMain)
	require.Equal(t, mainApp.ID, gotMain.ID)

	gotPoC, err := r.GetAppBySlug(ctx, "geo-intel", "geo-poc")
	require.NoError(t, err)
	require.NotNil(t, gotPoC)
	require.Equal(t, pocApp.ID, gotPoC.ID)

	missing, err := r.GetAppBySlug(ctx, "geo-intel", "does-not-exist")
	require.NoError(t, err)
	require.Nil(t, missing, "unknown branch must return nil without error")

	// ListApps with branch filter returns exactly one row per branch.
	mainList, total, err := r.ListApps(ctx, ListAppsFilter{Branch: models.DefaultAppBranch})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Len(t, mainList, 1)
	require.Equal(t, mainApp.ID, mainList[0].ID)
	require.Equal(t, "main", mainList[0].Branch)

	pocList, total, err := r.ListApps(ctx, ListAppsFilter{Branch: "geo-poc"})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, pocApp.ID, pocList[0].ID)

	// ListApps without a branch filter returns both rows (admin view).
	allList, total, err := r.ListApps(ctx, ListAppsFilter{})
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Len(t, allList, 2)
}

func TestAppRepo_PublishCarriesBranch(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	harness := testingx.BootPostgres(ctx, t)
	require.NoError(t, Migrate(ctx, harness.Pool))

	r := &Repo{Pool: harness.Pool}
	creator := uuid.New()

	app, err := r.CreateApp(ctx, &models.CreateAppRequest{
		Name:   "GeoIntel PoC",
		Slug:   "geo-intel-poc",
		Branch: "geo-poc",
		Pages:  json.RawMessage(`[{"id":"main","name":"Main","path":"/","layout":{"kind":"grid","columns":12},"widgets":[],"visible":true}]`),
	}, &creator)
	require.NoError(t, err)

	v1, err := r.PublishApp(ctx, app.ID, "first release on geo-poc", &creator)
	require.NoError(t, err)
	require.NotNil(t, v1)
	require.Equal(t, 1, v1.VersionNumber)
	require.Equal(t, "geo-poc", v1.Branch,
		"version must inherit the parent app's branch")

	v2, err := r.PublishApp(ctx, app.ID, "second release", &creator)
	require.NoError(t, err)
	require.Equal(t, 2, v2.VersionNumber)
	require.Equal(t, "geo-poc", v2.Branch)

	versions, err := r.ListAppVersions(ctx, app.ID)
	require.NoError(t, err)
	require.Len(t, versions, 2)
	for _, v := range versions {
		require.Equal(t, "geo-poc", v.Branch)
	}

	// GetPublishedVersion still resolves the latest pointer.
	published, err := r.GetPublishedVersion(ctx, app.ID)
	require.NoError(t, err)
	require.NotNil(t, published)
	require.Equal(t, v2.ID, published.ID)
	require.Equal(t, "geo-poc", published.Branch)

	// PromoteAppVersion (rollback) keeps the branch.
	promoted, err := r.PromoteAppVersion(ctx, app.ID, v1.ID, "rollback to v1", &creator)
	require.NoError(t, err)
	require.Equal(t, 3, promoted.VersionNumber)
	require.Equal(t, "geo-poc", promoted.Branch)
}

func TestAppRepo_ValidationErrorCarriesPath(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	harness := testingx.BootPostgres(ctx, t)
	require.NoError(t, Migrate(ctx, harness.Pool))

	r := &Repo{Pool: harness.Pool}
	creator := uuid.New()

	// Two widgets sharing an id must produce a *models.ValidationError
	// with Path = pages[0].widgets[1].id and Code = duplicate_widget_id.
	_, err := r.CreateApp(ctx, &models.CreateAppRequest{
		Name:  "Broken widgets",
		Slug:  "broken-widgets",
		Pages: json.RawMessage(`[{"id":"main","name":"M","path":"/","widgets":[{"id":"w1","widget_type":"text"},{"id":"w1","widget_type":"text"}]}]`),
	}, &creator)
	require.Error(t, err)
	ve := models.AsValidationError(err)
	require.NotNil(t, ve, "schema error must surface as *models.ValidationError")
	require.Equal(t, "duplicate_widget_id", ve.Code)
	require.Equal(t, "pages[0].widgets[1].id", ve.Path)
}
