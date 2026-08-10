# Product Removal Boundary

## Governing Principle

> BeCoder does not preserve removed product capabilities. It removes their product dependency graphs while retaining ordinary infrastructure that remains useful without them.

Classification follows actual product function, consumers, imports, registrations, APIs, settings, build entries, and package outputs. It never follows a repository-wide keyword count.

## Removed Product Capabilities

BeCoder does not ship or expose:

- AI, Chat, Agent, Agent Sessions, language-model, or MCP product functionality;
- AI default account, entitlement, quota, policy, managed settings, registry, prompts, skills, or runtime resources;
- Web Content Extractor, Agent Network Filter, or Browser View automation/CDP/Playwright channel;
- Debug Workbench, debug contribution APIs, bundled debug extensions, or GDB;
- Source Control, SCM contribution APIs, Quick Diff, built-in Git bridge, or SCM product surfaces;
- the removed terminal initial suggestion hint or Workbench Terminal Suggest overlay.

Do not add Null, Empty, or Stub replacement services, compatibility layers, migrations, serializers, state cleanup, or speculative future restoration interfaces for these removed products.

Extensions cannot recreate removed Chat, Agent, language-model, MCP, Debug, or SCM product surfaces through manifest contribution points or extension APIs.

## Retained Generic Infrastructure

Retain ordinary capabilities with non-target consumers, including:

- generic `vscode.authentication`, extension authentication providers, OAuth callbacks, secure credential storage, and account access;
- Browser View and interactive ordinary webpages, including third-party AI websites, without BeCoder AI integration or automation;
- `htmlToMarkdown` and its generic tests;
- Quick Access and generic attachment/explicit-selection mechanisms;
- Markdown, Mermaid, Notebook Markdown cells, standalone diagram preview, zoom, and source copy;
- generic Diff and Multi Diff;
- terminal, editor, search, Tasks, testing, Images Preview, policy, configuration, and extension infrastructure;
- Playwright only as development/test infrastructure, never a packaged BeCoder automation service;
- user project `.vscode` and Git assets;
- native PowerShell use of ordinary `git` commands.

IANA port names, package names, comments, test fixtures, or unreachable upstream source containing target words are not product capabilities by themselves.

## Mermaid Boundary

`vscode.mermaid-markdown-features` is a bundled ordinary Markdown-reading component. Keep Markdown and Notebook rendering, Markdown-It integration, theme adaptation, zoom, source copy, and standalone preview.

Remove Chat output contributions, `vscode.chat` registration, language-model types, `text/vnd.mermaid` Chat protocol, Chat history recovery, Chat context menus, and Chat-only resources/translations.

## Authentication Boundary

Keep generic Authentication APIs and extension-provided providers. Remove only Copilot/default-account entitlement, AI policy, managed settings, MCP registry/account preferences, and AI-specific account UI or telemetry. Open VSX requires no BeCoder account.

## Source and Package Classification

For a proposed deletion, inspect:

1. product and extension manifest contributions;
2. runtime service and command registrations;
3. static and type imports;
4. build and bundle entry points;
5. localization resources;
6. packaged outputs;
7. positive ordinary consumers that must remain.

Pure unreachable upstream source may remain only when it creates no product, build, runtime, type, or package dependency. Do not retain a service merely to make unreachable source typecheck.

## Acceptance Boundary

Boundary tests must prove both absence and retention. Package verification rejects target product registrations and resources while positively requiring Authentication, Browser View, Markdown/Mermaid, terminal, Tasks, `.vscode`, ordinary Git assets, generic Diff, and other named retained infrastructure. Avoid broad keyword-only assertions.
