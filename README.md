# NEXUS

NEXUS is a modular Android AI application built around local and remote language models.

The project began from the ChatterUI codebase and is being evolved into an independent AI platform while preserving the useful functionality of the original application.

## Current Features

- Local GGUF language models
- Model importing and management
- Character cards
- Independent character personalities
- Conversation management
- Adjustable model settings
- Context and sampler controls
- Local llama.cpp-based inference
- Streaming responses
- Text-to-speech support
- Image/vision support where supported by the selected model
- Web research tools
- Modular tool architecture
- AI-managed memory foundation

## Architecture

NEXUS is designed around independent layers:

```text
NEXUS
├── Model Layer
│   ├── Local GGUF models
│   └── Remote/API models
│
├── Character Layer
│   └── Character cards
│
├── Tool Layer
│   ├── Web Search
│   ├── Web/Page Reading
│   ├── Calculator
│   ├── Weather/Time
│   └── Future tools
│
├── Memory Layer
│   └── Contextual AI-managed memory
│
└── Future Agent Layer
    └── Multiple independent AI agents
