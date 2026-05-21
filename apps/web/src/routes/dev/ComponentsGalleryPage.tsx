import { useState } from "react";

import { Badge, type BadgeVariant } from "@/lib/components/ui/Badge";
import { Glyph } from "@/lib/components/ui/Glyph";
import { GroupChip } from "@/lib/components/ui/GroupChip";
import { MiniLinkGraph } from "@/lib/components/ui/MiniLinkGraph";
import { ResourceCard } from "@/lib/components/ui/ResourceCard";
import { ResourceIcon } from "@/lib/components/ui/ResourceIcon";
import { SectionHeader } from "@/lib/components/ui/SectionHeader";
import { SidePanelTabs } from "@/lib/components/ui/SidePanelTabs";
import { StarFavoriteButton } from "@/lib/components/ui/StarFavoriteButton";
import { TabBar } from "@/lib/components/ui/TabBar";
import { OntologySelector } from "@/lib/components/ontology/OntologySelector";
import { ontologyGroupColor } from "@/lib/components/ontology/groupColors";

/**
 * Visual gallery of the Foundry-calque primitives.
 *
 * Opens at /dev/components. Useful while pixel-tuning the calque
 * without standing up Storybook. Each section renders a single
 * primitive across its variants so the entire token surface is
 * exercised on one page.
 */
export function ComponentsGalleryPage() {
  return (
    <main className="min-h-screen bg-of-canvas p-6">
      <header className="max-w-[1200px] mx-auto flex flex-col gap-1 mb-6">
        <h1 className="text-of-24 font-of-semibold text-of-text m-0">
          Components gallery
        </h1>
        <p className="text-of-13 text-of-text-muted m-0">
          Foundry-calque primitives — used to pin pixels without spinning up
          Storybook. Edit, save, refresh.
        </p>
      </header>

      <div className="max-w-[1200px] mx-auto flex flex-col gap-8">
        <Section title="Design tokens">
          <ColorSwatches />
          <FontSizes />
          <RadiiAndShadows />
        </Section>

        <Section title="ResourceIcon">
          <Row>
            {(["xs", "sm", "md", "lg"] as const).map((size) => (
              <Cluster key={size} caption={`size="${size}"`}>
                <ResourceIcon
                  glyph="cube"
                  colorKey="aviation"
                  size={size}
                  tone="soft"
                />
                <ResourceIcon
                  glyph="cube"
                  colorKey="aviation"
                  size={size}
                  tone="solid"
                />
              </Cluster>
            ))}
            <Cluster caption="varied glyphs">
              <ResourceIcon glyph="document" colorKey="marketing" />
              <ResourceIcon glyph="ontology" colorKey="crm" />
              <ResourceIcon glyph="run" colorKey="operations" tone="solid" />
              <ResourceIcon glyph="code" colorKey="reporting" />
            </Cluster>
          </Row>
        </Section>

        <Section title="Badge">
          <Row>
            {(
              [
                "title",
                "primary-key",
                "experimental",
                "active",
                "visibility-normal",
                "visibility-hidden",
                "visibility-prominent",
                "disabled",
                "not-indexed",
              ] satisfies BadgeVariant[]
            ).map((variant) => (
              <Cluster key={variant} caption={variant}>
                <Badge variant={variant} />
              </Cluster>
            ))}
          </Row>
        </Section>

        <Section title="GroupChip">
          <Row>
            {[
              "CRM",
              "Marketing",
              "Operations",
              "Aviation",
              "Reporting",
              "Equipment",
              "Carbon",
              "Logistics",
            ].map((name) => (
              <Cluster key={name} caption={name}>
                <GroupChip
                  name={name}
                  count={Math.floor(Math.random() * 80) + 4}
                  color={ontologyGroupColor(name)}
                />
              </Cluster>
            ))}
            <Cluster caption="size=sm">
              <GroupChip
                name="Aviation"
                count={14}
                color={ontologyGroupColor("Aviation")}
                size="sm"
              />
            </Cluster>
          </Row>
        </Section>

        <Section title="StarFavoriteButton">
          <StarRow />
        </Section>

        <Section title="SectionHeader">
          <SectionHeader
            title="Recently viewed object types"
            count={32}
            onConfigure={() => undefined}
            onSeeAll={() => undefined}
          />
          <SectionHeader title="Favourite type groups" count={6} />
        </Section>

        <Section title="ResourceCard">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ResourceCard
              name="Campaign"
              glyph="document"
              iconColor={ontologyGroupColor("Marketing")}
              objectCount="16k objects"
              dependentsCount={9}
              group={{
                name: "Marketing",
                count: 332,
                color: ontologyGroupColor("Marketing"),
              }}
              description="A marketing campaign is a planned and organized effort to promote a specific company or product."
              favorite={false}
              onToggleFavorite={() => undefined}
            />
            <ResourceCard
              name="Employee"
              glyph="users"
              iconColor={ontologyGroupColor("Human Resources")}
              objectCount="2k objects"
              dependentsCount={9}
              prominent
              group={{
                name: "Human Resources",
                count: 34,
                color: ontologyGroupColor("Human Resources"),
              }}
              description="All employees in the organization."
              favorite
              onToggleFavorite={() => undefined}
            />
            <ResourceCard
              name="Ticket"
              glyph="document"
              iconColor={ontologyGroupColor("Operations")}
              objectCount="34k objects"
              dependentsCount={5}
              group={{
                name: "Operations",
                count: 4,
                color: ontologyGroupColor("Operations"),
              }}
              description="A ticket is a term for an issue or a work item that needs to be addressed or investigated."
            />
          </div>
        </Section>

        <Section title="MiniLinkGraph">
          <div className="rounded-of-md border border-of-border bg-of-surface p-3">
            <MiniLinkGraph
              width={460}
              height={150}
              nodes={[
                {
                  id: "flight",
                  label: "Flight",
                  glyph: "run",
                  colorKey: "Aviation",
                },
                {
                  id: "aircraft",
                  label: "Aircraft",
                  glyph: "cube",
                  colorKey: "Aviation",
                },
                {
                  id: "airline",
                  label: "Airline",
                  glyph: "users",
                  colorKey: "Aviation",
                },
                {
                  id: "airport",
                  label: "Airport",
                  glyph: "object",
                  colorKey: "Aviation",
                },
              ]}
              edges={[
                { from: "flight", to: "aircraft", label: "1" },
                { from: "aircraft", to: "airline", label: "*" },
                { from: "aircraft", to: "airport", label: "*" },
              ]}
            />
          </div>
        </Section>

        <Section title="TabBar">
          <TabBarPreview />
        </Section>

        <Section title="SidePanelTabs">
          <SidePanelTabsPreview />
        </Section>

        <Section title="OntologySelector">
          <div className="max-w-[280px]">
            <OntologySelector
              name="airports_ontology_2"
              spacePath="ontology / production"
              onClick={() => undefined}
            />
          </div>
        </Section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------------- */
/* Section + scaffolding helpers                                              */
/* ------------------------------------------------------------------------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 p-4 bg-of-surface-raised border border-of-border rounded-of-md shadow-of-card">
      <h2 className="text-of-16 font-of-semibold text-of-text m-0">{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-4">{children}</div>;
}

function Cluster({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">{children}</div>
      <span className="text-of-12 text-of-text-muted">{caption}</span>
    </div>
  );
}

function ColorSwatches() {
  const swatches: Array<[string, string]> = [
    ["Surface", "var(--of-surface)"],
    ["Surface raised", "var(--of-surface-raised)"],
    ["Border", "var(--of-border)"],
    ["Border strong", "var(--of-border-strong)"],
    ["Text", "var(--of-text)"],
    ["Text muted", "var(--of-text-muted)"],
    ["Accent", "var(--of-accent)"],
    ["Accent soft", "var(--of-accent-soft)"],
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {swatches.map(([label, value]) => (
        <div key={label} className="flex flex-col items-start gap-1">
          <span
            className="inline-block w-12 h-12 rounded-of-sm border border-of-border"
            style={{ background: value }}
          />
          <span className="text-of-12 text-of-text">{label}</span>
          <span className="text-of-12 text-of-text-muted font-mono">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function FontSizes() {
  const sizes: Array<[string, string]> = [
    ["text-of-12", "12 / 16"],
    ["text-of-13", "13 / 18"],
    ["text-of-14", "14 / 20"],
    ["text-of-16", "16 / 22"],
    ["text-of-20", "20 / 26"],
    ["text-of-24", "24 / 30"],
  ];
  return (
    <div className="flex flex-col gap-1">
      {sizes.map(([cls, label]) => (
        <span key={cls} className={`${cls} text-of-text`}>
          {label} — The quick brown fox jumps over the lazy dog
        </span>
      ))}
    </div>
  );
}

function RadiiAndShadows() {
  return (
    <div className="flex flex-wrap gap-3">
      {(
        [
          ["rounded-of-sm (3px)", "rounded-of-sm"],
          ["rounded-of-md (4px)", "rounded-of-md"],
          ["rounded-of-lg (6px)", "rounded-of-lg"],
        ] as const
      ).map(([label, cls]) => (
        <div key={cls} className="flex flex-col items-start gap-1">
          <span
            className={`inline-block w-16 h-12 bg-of-accent-soft border border-of-border ${cls}`}
          />
          <span className="text-of-12 text-of-text-muted">{label}</span>
        </div>
      ))}
      {(
        [
          ["shadow-of-sm", "shadow-of-sm"],
          ["shadow-of-card", "shadow-of-card"],
          ["shadow-of-popover", "shadow-of-popover"],
        ] as const
      ).map(([label, cls]) => (
        <div key={cls} className="flex flex-col items-start gap-1">
          <span
            className={`inline-block w-16 h-12 rounded-of-md bg-of-surface-raised border border-of-border ${cls}`}
          />
          <span className="text-of-12 text-of-text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

function StarRow() {
  const [favorites, setFavorites] = useState({
    sm: true,
    md: false,
    lg: true,
  });
  return (
    <Row>
      {(["sm", "md", "lg"] as const).map((size) => (
        <Cluster key={size} caption={`size="${size}"`}>
          <StarFavoriteButton
            value={favorites[size]}
            onChange={(next) =>
              setFavorites((current) => ({ ...current, [size]: next }))
            }
            size={size}
            stopPropagation={false}
          />
        </Cluster>
      ))}
    </Row>
  );
}

function TabBarPreview() {
  const [active, setActive] = useState<"overview" | "properties" | "links">(
    "overview",
  );
  return (
    <TabBar
      tabs={[
        { id: "overview" as const, label: "Overview" },
        { id: "properties" as const, label: "Properties", count: 15 },
        { id: "links" as const, label: "Link types", count: 4, glyph: "link" },
      ]}
      active={active}
      onChange={(next) => setActive(next)}
    />
  );
}

function SidePanelTabsPreview() {
  const [active, setActive] = useState<
    "general" | "display" | "interaction" | "details" | "advanced"
  >("general");
  return (
    <SidePanelTabs
      tabs={[
        { id: "general" as const, label: "General" },
        { id: "display" as const, label: "Display" },
        { id: "interaction" as const, label: "Interaction" },
        { id: "details" as const, label: "Details" },
        { id: "advanced" as const, label: "Advanced" },
      ]}
      active={active}
      onChange={(next) => setActive(next)}
    />
  );
}

// Hint to consumers that the icon namespace is wired (silence noUnusedLocals).
const _glyphProbe: typeof Glyph = Glyph;
void _glyphProbe;
