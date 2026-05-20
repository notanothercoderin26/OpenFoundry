---
title: "Palantir"
source: "https://www.palantir.com/docs/foundry/ontology-manager/overview/"
scraped_at: "2026-05-20T04:11:40Z"
---

# Palantir

## Captura de pantalla

![Screenshot](Overview.screenshot.png)

---

Search

[Palantir](//www.palantir.com)

- Documentation

  - [Documentation](/docs/foundry/)
  - [Apollo](/docs/apollo/)
  - [Gotham](/docs/gotham/)

Search documentation

Search

karat

+

K

[API Reference ↗](/docs/foundry/api-reference/)Send feedback

en

enjpkrzh

ABXY

ABXYABXYABXYABXYABXYABXY

- Capabilities

  - [AI Platform (AIP)](/docs/foundry/aip/overview/)
  - [Data connectivity & integration](/docs/foundry/data-integration/overview/)
  - [Model connectivity & development](/docs/foundry/model-integration/overview/)
  - [Ontology building](/docs/foundry/ontology/overview/)
  - [Developer toolchain](/docs/foundry/dev-toolchain/overview/)
  - [Use case development](/docs/foundry/app-building/overview/)
  - [Observability](/docs/foundry/observability/overview/)
  - [Analytics](/docs/foundry/analytics/overview/)
  - [Product delivery](/docs/foundry/devops/overview/)
  - [Security & governance](/docs/foundry/security/overview/)
  - [Management & enablement](/docs/foundry/administration/overview/)
- [Getting started](/docs/foundry/getting-started/overview/)
- [Architecture center](/docs/foundry/architecture-center/overview/)
- Platform updates

  - [Announcements](/docs/foundry/announcements/)
  - [Release notes](/docs/foundry/announcements/release-notes/)

[Ontology building](/docs/foundry/ontology/overview/)[Ontology Manager](/docs/foundry/ontology-manager/overview/)[Overview](/docs/foundry/ontology-manager/overview/)

# Ontology Manager

**Ontology Manager** (sometimes called the Ontology Management Application, or OMA) enables you to build and maintain your organization’s Ontology. You can use Ontology Manager for a wide range of activities related to your Ontology, from creating a new object type and defining a new action type, to connecting data to the Ontology, and investigating whether data is updating in user applications.

## Accessing the application

You can access the application in three different ways, by either:

- Selecting the **Ontology Manager** icon from the Workspace sidebar’s **Apps** section;
- Right-clicking on an object type in Data Lineage and selecting **Configure object type**; or
- Adding `/workspace/ontology` to the end of your Foundry home page URL (for instance, `https://example.website.com/workspace/ontology`).

## User interface

The Ontology Manager interface is divided into the following elements that you will see referenced throughout the documentation:

- [Ontology Manager navigation](#ontology-manager-navigation)
- [Discover view](#discover)
- [Object type view](#object-type-view)
- [Property editor view](#property-editor-view)
- [Link type view](#link-type-view)
- [Action type view](#action-type-view)
- [Function type view](#function-type-view)

### Ontology Manager navigation

The two persisting elements of Ontology Manager are the top bar and the sidebar. The top bar and sidebar serve as navigation elements, providing intuitive access to various features, functionalities, and sections within the application.

The top bar has three main functionalities. It allows users to search for Ontology resources, create new Ontology resources, and navigate between or create new branches.

The sidebar provides easy navigation to different resources, pages, or applications within Ontology Manager.

![Ontology Manager annotated view.](Overview_assets/img_001.png)

### Discover

The Discover view offers a highly customizable landing page tailored to your preferences. By default, the Discover view showcases favorite object types, recently-viewed object types, and favorite groups.

![Ontology Manager Discover view.](Overview_assets/img_002.png)

In case the user is new to the Ontology, two specialized sections will be presented: one which displays all object types that were recently modified within that Ontology, and one for all prominent object types.

![Ontology Manager Fallback sections.](Overview_assets/img_003.png)

The Discover view provides the flexibility to configure the sections that appear on the page and control the number of items displayed within each section. The available sections include "Recently viewed object types," "Favorite object types," and "Favorite groups." Additionally, you have the option to add a separate section for a specific group, allowing you to explore all object types within that group.

![Ontology Manager Customize homepage feature.](Overview_assets/img_004.png)

![Ontology Manager Group section.](Overview_assets/img_005.png)

### Object type view

Selecting an object type brings up the object type view, which has the following components:

- Sidebar with page selections (on the left in the image below)
- Selected page (on the right in the image below)

![Object type view.](Overview_assets/img_006.png)

The **Overview** page of an object type has the following sections, as numbered in the image below:

1. Object type metadata
2. Properties
3. Action types
4. Link type graph
5. Dependents
6. Data
7. Usage

![Object type overview page.](/docs/resources/foundry/ontology-manager/oma-user-interface-overview-annotated.png)

### Property editor view

Select a property from the **Properties** section of an object type’s **Overview** page to open the property editor view of the application.

![Property editor interface.](/docs/resources/foundry/ontology-manager/oma-user-interface-property-editor-v2.png)

### Link type view

Selecting a link type from the link type graph of an object type’s **Overview** tab (see image below) opens the link type view (with **Overview** and **Datasources** pages).

![Link type view.](/docs/resources/foundry/ontology-manager/oma-user-interface-link-type.png)

### Action type view

Selecting an action type from the action type section of an object type’s **Overview** tab opens the action type view, with further access to the **Overview**, **Logic** and **Observability** pages.

![Action type view.](/docs/resources/foundry/ontology-manager/oma-user-interface-action-type.png)

#### View action metrics and monitoring rules

The **Observability** tab shows the near real-time [usage of the action](/docs/foundry/action-types/action-metrics/) over the last 30 days as well as any [monitoring rules](/docs/foundry/monitoring-views/overview/) and their status defined for the action. [Review action rules](/docs/foundry/monitoring-views/rules-reference/#action-rules) for detailed action monitoring rule configuration options.

![Action observability tab view.](/docs/resources/foundry/ontology-manager/oma-user-interface-action-type-observability-tab.png)

### Function type view

Selecting a function type from the function type section of an object type’s **Overview** tab opens the function type view, with further access to the **Overview**, **Configuration** and **Observability** pages.

#### Usage history of a function

The Usage History panel records the applications which have used any version of a function, along with the respective version information. From this panel, you can navigate to these applications in order to upgrade the version of a function.

#### View previous versions of a function

By default, the latest version of the function is displayed. To view other versions, use the version dropdown selector located in the left panel.

#### Navigate to the Functions Code Repository

Modifications to the function can only be made within the Functions Code Repository. To navigate to the repository, use the **Open in Code Repository** button found in the top right-hand corner of the entity view.

![Function type view.](/docs/resources/foundry/ontology-manager/oma-user-interface-function-type.png)

#### View function metrics and monitoring rules

The **Observability** tab shows the near real-time [usage of the function](/docs/foundry/functions/function-metrics/) over the last 30 days as well as any [monitoring rules](/docs/foundry/monitoring-views/overview/) and their status defined for the function. [Review function rules](/docs/foundry/monitoring-views/rules-reference/#function-rules) for detailed function monitoring rule configuration options.

![Function observability tab view.](/docs/resources/foundry/ontology-manager/oma-user-interface-function-type-observability-tab.png)

[←

PREVIOUSObject Views / Add Object Views to a Marketplace product](/docs/foundry/object-views/marketplace-object-views/)

[NEXTNavigation

→](/docs/foundry/ontology-manager/navigation/)

By clicking “Accept All Cookies”, you agree to the storing of cookies on your device to enhance site navigation, analyze site usage, and assist in our marketing efforts. [More Info](https://www.palantir.com/cookie-statement/)

Accept All Cookies Reject All

Cookies Settings

![Palantir Logo](https://cdn.cookielaw.org/logos/356f77a2-eb53-4146-ba66-df614f266841/5368e276-ae2d-4671-8f4a-e56a019150c2/7c112fc8-28d0-4e66-9fa9-c70daf8d700a/Palantir_Logo_300dpi_(1).png)

## Privacy Preference Center

- ### Your Privacy
- ### Strictly Necessary Cookies
- ### Targeting Cookies

#### Your Privacy

When you visit any website, it may store or retrieve information on your browser, mostly in the form of cookies. This information might be about you, your preferences, or your device, and is mostly used to make the site work as you expect. The information does not usually identify you directly, but it can give you a more personalized web experience. Because we respect your right to privacy, you can choose not to allow some types of cookies. Click on the different category headings to learn more and change our default settings. Blocking some types of cookies may impact your experience of the site and the services we are able to offer.
\
[More information](https://www.palantir.com/cookie-statement/)

#### Strictly Necessary Cookies

Always Active

These cookies are necessary for the website to function and cannot be switched off in our systems. They are usually only set in response to actions made by you which amount to a request for services, such as setting your privacy preferences, logging in or filling in forms. You can set your browser to block or alert you about these cookies, but some parts of the site will not then work. These cookies do not store any personally identifiable information.

Cookies Details

#### Targeting Cookies

Targeting Cookies

These cookies may be set through our site by our advertising partners. They may be used by those companies to build a profile of your interests and show you relevant adverts on other sites. They do not store directly personal information, but are based on uniquely identifying your browser and internet device. If you do not allow these cookies, you will experience less targeted advertising.

Cookies Details

Back Button

### Cookie List

Consent Leg.Interest

checkbox label label

checkbox label label

checkbox label label

Clear

- checkbox label label

Apply Cancel

Confirm My Choices

Reject All Allow All

[![Powered by Onetrust](https://cdn.cookielaw.org/logos/static/powered_by_logo.svg "Powered by OneTrust Opens in a new Tab")](https://www.onetrust.com/products/cookie-consent/)
