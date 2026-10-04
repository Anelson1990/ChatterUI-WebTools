# Contributing to NEXUS

Thank you for contributing to NEXUS.

NEXUS is an Android AI application focused on local and remote language models, character-driven conversations, modular tools, and future contextual memory capabilities.

## Development Principles

### Preserve Existing Functionality

Before changing an existing component, determine whether the feature can be added without replacing functionality that already works.

Important existing systems include:

- GGUF model management
- Local model loading
- Character cards
- Conversations
- Model settings
- Sampler and context controls
- Native llama functionality
- Streaming inference

Avoid unnecessary rewrites.

### Keep Features Modular

New capabilities should be implemented as independent modules whenever practical.

The intended architecture is:

```text
NEXUS
├── Models
├── Characters
├── Tools
├── Memory
└── Future Agents
