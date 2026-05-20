---
title: "Palantir"
source: "https://www.palantir.com/docs/foundry/workshop/widgets-button-group/"
scraped_at: "2026-05-20T04:11:22Z"
---

# Palantir

## Captura de pantalla

![Screenshot](Widgets Button Group.screenshot.png)

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

[Use case development](/docs/foundry/app-building/overview/)[Workshop](/docs/foundry/workshop/overview/)[Event-trigger & navigational widgets](/docs/foundry/workshop/widgets-event-navigational/)[Button Group](/docs/foundry/workshop/widgets-button-group/)

# Button Group

The **Button Group** widget allows application builders to add buttons to a Workshop module that can trigger [Actions](/docs/foundry/action-types/overview/) and [Workshop events](/docs/foundry/workshop/concepts-events/), open URLs, or start an export. Builders configuring a Button Group widget can do the following:

- Choose between the following three button types:
  - **Inline** buttons that provide a single option
  - **Menu** buttons that provide multiple options
  - **Two-part** buttons that contain a primary button alongside an additional menu of options.
- Configure [**On click**](#on-click) for each button to trigger an action, trigger a set of events, open a URL, or begin an export.
- Adjust styling by setting the color, icon, size, and fill options of each button.
- Configure a conditional disabled state or conditional visibility based on the value of a Boolean variable.

The screenshot below shows an example of two rows of configured Button Group widgets and highlights the different button type and display options provided:

![button_group_example](Widgets Button Group_assets/img_001.png)

## Widget configuration options

The screenshot below shows the configuration options available for the Button Group widget:

![Configuration for a button group widget](Widgets Button Group_assets/img_002.png)

For the Button Group widget, the core configuration options are the following:

- **Button type**
  - This three-way option controls the type of button displayed, with the following choices:
    - **Inline** buttons that provide a single option
    - **Menu** buttons that provide multiple options
    - **Two-part** buttons that contain a primary button alongside an additional menu of options

## Button configuration options

The screenshot below shows the configuration options available for a button within the Button Group widget:

![Configuration for a button within the button group widget](Widgets Button Group_assets/img_003.png)

- **Add button:** Selecting this option adds another button / menu item to this button group.
- **Duplicate button:** Selecting this option creates a copy of an existing button's configuration, allowing builders to quickly replicate button settings.
- **Button text:** This parameter sets the display text for a given button or menu item.
- **Button color:** This configuration controls the coloring of a given button or menu item. You can choose either a preset "intent" with an associated color, or specify a custom color. Intent options and their associated colors include **none**, **primary** (blue), **success** (green), **warning** (amber), and **danger** (red). You can use the custom option to pick from a wider variety of color options, including setting a color using a hex code.
- **Left icon:** This parameter controls the icon displayed to the left of a button / menu item's display text. Set to **Blank** to not show an icon.
- **Right icon:** This parameter controls the icon displayed to the right of a button / menu item's display text. Set to **Blank** to not show an icon.
- **Description:** This parameter will show up to the user as a tooltip when hovering over the button.
- **Conditional visibility:** If conditional visibility is toggled on, the following options will be available:
  - **Boolean variable:** This is the variable that will be used to determine the conditional state of the button.
  - **State if false:** This option controls if the button should be disabled or hidden when the selected variable value is false.
- **On click:** This option controls what is triggered when a user interacts with a button or menu item. Options include triggering [Actions](/docs/foundry/action-types/overview/), one or more [Workshop events](/docs/foundry/workshop/concepts-events/), opening URLs, or starting an export. If multiple Workshop events are configured, updates to variable state may not be complete before the rest of the events run. A full list of **On click** options [can be found below](#on-click).
- **Display & formatting**
  - **Minimal style:** If enabled, this option removes the border from a button. If a color has been applied, the background color and text color of the button / menu item will be reversed (for example, a primary-intent button could flip from having a blue background and white text to having a white background and blue text).
  - **Tag style:** If enabled, this option adjusts a given button to have a more narrow tag styling.
  - **Large style:** If enabled, this increases the overall size of a button.
  - **Fill available horizontal space in row and column layouts:** If enabled, this button group will fill the horizontal space of its containing section.
- **Scenarios**
  - When using the button group to create an action, you can choose whether to apply the action to a Scenario or to the Ontology.
  - **Apply to Scenario:** Enable this toggle to apply this action to a Scenario instead of the main Ontology.
  - **Select Scenario variable:** Select the Scenario variable to apply this action to.
  - See the [Scenarios documentation](/docs/foundry/workshop/scenarios-overview/) for more information on Scenarios.

### On click

Buttons can trigger actions, layout events, URLs, and different types of exports. Each option is described in detail below.

![On click config for a button in the Button Group widget](Widgets Button Group_assets/img_004.png)

#### Actions

Actions allow users to easily create, edit, delete, and link objects in pre-defined ways and can be triggered by Workshop events. As an example, an application builder could configure a Button Group widget within a module to trigger a "Modify Flight Destination" action that allows the user to edit the `Destination` property on a select `Flight` object.

Learn more about [configuring and exposing Actions within a Workshop module](/docs/foundry/workshop/actions-use/#use-an-action-within-workshop).

For more details on Actions in general, review our [action type documentation](/docs/foundry/action-types/overview/).

##### Chaining an event with an action

When configuring a button to trigger an action, you can also configure a Workshop event to occur at a specific point in the action's lifecycle. At the bottom of the widget configuration, select one of the following event trigger options:

- **On start of action submission:** The configured event occurs when the action submission begins.
- **On successful completion of action submission:** The configured event occurs after the action has been successfully submitted.

This allows you to chain an action and an event on a single button, enabling workflows such as refreshing data, navigating to another page, or updating variables after an action completes.

#### Event

Review our [events documentation](/docs/foundry/workshop/concepts-events/) for full details on using events in Workshop.

#### URL

URL events trigger the opening of specified URLs from within a Workshop module. For example, an application builder could use a URL event to navigate within Foundry and open the Object Explorer application, or designate an external website to open when a user selects a given Button Group widget.

The screenshot below shows an example definition of an external URL event from within a Button Group widget:

![Input configuring https://www.palantir.com for a button URL](Widgets Button Group_assets/img_005.png)

When defining an external URL, include the prefix `https://`.

#### Export

Export events take an object set variable as an input and trigger the export of the objects in the object set to either Excel or the user’s clipboard. An application builder may optionally configure a file name and select the set of properties that should be included in the export.

The screenshot below shows an example definition of an Export event from within a Button Group widget:

![Configuration to export an object set](Widgets Button Group_assets/img_006.png)

Note that if [function-backed columns](/docs/foundry/workshop/widgets-object-table/#function-backed-columns) or linked object columns are included, the export file format will be CSV and not Excel.

#### Function-backed export

Function-backed exports take a Function and its inputs, and download the output into a specified file type such as PDF. For a Function to be exportable, its output must be a string. Below is a sample Function-backed export definition from within a Button Group widget:

![Configuration for a function backed export](/docs/resources/foundry/workshop/button_group_function_backed_export.png)

#### Export media

Export media events take a list of exported items and trigger the download of all media associated with those items. To configure an export item, select the object set, type of media, media property, and max number of objects to download. You can configure a custom file name for downloaded media, with substitutions available for the current timestamp, original file name, and non-primary key object property values. If no custom file name is provided, the original file name will be used.

Below is a sample export media event definition from within a Button Group widget:

![Configuration for export media](/docs/resources/foundry/workshop/button_group_export_media.png)

A sample export item definition is shown below:

![Configuration for export media item](/docs/resources/foundry/workshop/button_group_export_media_item.png)

[←

PREVIOUSOverview](/docs/foundry/workshop/widgets-event-navigational/)

[NEXTMedia Uploader

→](/docs/foundry/workshop/widgets-media-uploader/)

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
