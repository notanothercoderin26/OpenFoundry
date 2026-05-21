# 🧪 OpenFoundry PoCs — index

> **Status:** documentation ready. None of the PoCs is being executed yet — we are waiting for the OpenFoundry MVP to reach a viable level. Each PoC is governed by its own Foundry-native contract: user-visible behavior must match how the equivalent workflow would be built in Palantir Foundry. **The PoC dictates the contract; OpenFoundry adapts.**

Each PoC lives in its own folder. The first three follow the 14-document structure (00 → 13) plus an internal `blockers/` directory cataloging the service-level gaps that prevent end-to-end execution today. The fourth, [`defence-supply-chain/`](defence-supply-chain/), is an **academic** PoC that targets a real Palantir Foundry tenancy (not OpenFoundry) and therefore follows a different `docs/00 → 15` layout — see its [`README`](defence-supply-chain/docs/00_README.md) for the rationale.

| Folder | Vertical | Foundry analogue | Status | Index |
|---|---|---|---|---|
| [`aviacion/`](aviacion/) | Civil aviation — fleet operations + MRO maintenance | Airbus Skywise / Foundry MRO | Docs ready, awaiting MVP | [`aviacion/README.md`](aviacion/README.md) |
| [`geopolitica/`](geopolitica/) | Geopolitical intelligence — actors, events, sanctions | Foundry / Gotham-style intelligence workflows | Docs ready, awaiting MVP | [`geopolitica/README.md`](geopolitica/README.md) |
| [`seguridad-urbana/`](seguridad-urbana/) | Urban public-safety operational intelligence — incidents, neighborhoods, shifts, reinforcement zones | Foundry / public-safety operational intelligence deployments (LAPD/NYPD-style) | Docs ready, awaiting MVP | [`seguridad-urbana/README.md`](seguridad-urbana/README.md) |
| [`defence-supply-chain/`](defence-supply-chain/) *(academic)* | EU defence supply-chain risk mapping — TED + EDF + OpenSanctions + OpenCorporates | Real Palantir Foundry tenancy — academic transparency exercise under EU FDI Screening Regulation | Docs ready, executable end-to-end on Foundry | [`defence-supply-chain/docs/00_README.md`](defence-supply-chain/docs/00_README.md) |

---

## How to choose which PoC to run

| Customer profile | Recommended PoC |
|---|---|
| Airline, MRO provider, airport authority, defense maintenance | **aviacion** |
| National intelligence agency, sanctions compliance, financial intelligence unit, defense analyst, NGO conflict monitoring | **geopolitica** |
| Municipal police force, regional public-safety analytics, metropolitan emergency-management agency | **seguridad-urbana** |
| Academic researcher, transparency NGO, defence-procurement analyst working under EU 2019/452 framing — running on a real Palantir Foundry tenancy, not OpenFoundry | **defence-supply-chain** *(academic — different layout)* |
| Anyone interested in *both* | Run **aviacion** first; it is the most "operational" narrative and easier to anchor on KPIs. Use **geopolitica** as a second meeting if the customer wants to see graph+entity-resolution workloads. |

## Common ground (read once, applies to both)

Both PoCs share the same non-negotiable constraints:

1. **Foundry-native contract.** Every customer-facing artifact must map to a public Palantir Foundry capability: Data Connection, Dataset, Pipeline Builder, Code Repositories, Ontology Manager, Object Type, Link Type, Action Type, Workshop, Quiver, AIP Chatbot, Data Lineage, Data Health, Action Log, Global Branching. OpenFoundry service names are implementation details only.
2. **Behavioral parity, not architectural parity.** A Foundry practitioner must be able to map every demo step to a known Foundry application or concept. Where a Foundry capability cannot be publicly verified, it is labeled as an OpenFoundry emulation.
3. **Public, legal data only.** No customer data, no real PII. Public sources + deterministic synthetic data where needed.
4. **The PoC dictates the contract.** When a PoC document says "Data Connection sync → raw dataset → Pipeline → Ontology → Action → Workshop", OpenFoundry must adapt its surface (UI labels, APIs, resource model) to fit — not the other way around.
5. **Acceptance is behavioral.** Each capability has explicit acceptance criteria in the per-PoC `00-contrato-foundry-native.md` file.

## What this folder is not

- Not a sales deck. The narrative for the customer lives in `11-guion-demo.md` inside each PoC.
- Not a sandbox. None of these files are executable end-to-end today; they describe how the demo *must* be run once the MVP and the blockers ([`aviacion/blockers/`](aviacion/blockers/), and the equivalent under `geopolitica/` once created) are resolved.
- Not a substitute for the per-module `CLAUDE.md` files. Agents implementing code must still respect the engineering instructions in the relevant service directories.
