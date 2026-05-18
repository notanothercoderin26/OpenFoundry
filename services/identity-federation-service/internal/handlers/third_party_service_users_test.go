package handlers

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/models"
)

func TestBuildThirdPartyServiceUserGrantValidatesScopeAndRole(t *testing.T) {
	t.Parallel()
	appID := uuid.New()
	serviceUserID := uuid.New()
	actor := uuid.New()

	grant, err := buildThirdPartyServiceUserGrant(appID, serviceUserID, actor, models.CreateThirdPartyServiceUserGrantRequest{
		ScopeType: models.ThirdPartyServiceUserGrantScopeProject,
		ScopeID:   "ri.compass.main.project.demo",
		RoleKey:   "editor",
	})

	require.NoError(t, err)
	require.Equal(t, appID, grant.ApplicationID)
	require.Equal(t, serviceUserID, grant.ServiceUserID)
	require.Equal(t, "ri.compass.main.project.demo", grant.ScopeID)
	require.Equal(t, "editor", grant.RoleKey)
	require.Equal(t, actor, *grant.GrantedBy)

	_, err = buildThirdPartyServiceUserGrant(appID, serviceUserID, actor, models.CreateThirdPartyServiceUserGrantRequest{
		ScopeType: "organization",
		ScopeID:   "org-a",
		RoleKey:   "viewer",
	})
	require.EqualError(t, err, "scope_type must be project or resource")

	_, err = buildThirdPartyServiceUserGrant(appID, serviceUserID, actor, models.CreateThirdPartyServiceUserGrantRequest{
		ScopeType: models.ThirdPartyServiceUserGrantScopeResource,
		RoleKey:   "viewer",
	})
	require.EqualError(t, err, "scope_id is required")
}

func TestServiceUserSeedUsesClientIDUsernameAndServiceUserAttributes(t *testing.T) {
	t.Parallel()
	actor := uuid.New()
	orgID := uuid.New()
	serviceUserID := uuid.New()
	app := &models.ThirdPartyApplication{
		ID:                     uuid.New(),
		ClientID:               "of3pa_test_client",
		Name:                   "Automation owner",
		ClientType:             models.ThirdPartyClientTypeConfidential,
		EnabledGrantTypes:      []string{models.ThirdPartyGrantClientCredentials},
		ManagingOrganizationID: orgID,
		ServiceUserID:          &serviceUserID,
	}

	seed := serviceUserSeedForThirdPartyApplication(app, actor)

	require.NotNil(t, seed)
	require.Equal(t, serviceUserID, seed.ID)
	require.Equal(t, app.ClientID, seed.Username)
	require.Equal(t, app.ClientID+"@service.openfoundry.local", seed.Email)
	require.JSONEq(t, `{"application_id":"`+app.ID.String()+`","oauth_client_id":"of3pa_test_client","service_user":true}`, string(seed.Attributes))
}
