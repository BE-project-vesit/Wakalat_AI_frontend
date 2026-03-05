# MCP Client & Gemini Integration Setup

## Overview
This project now includes an MCP (Model Context Protocol) client that connects to your MCP server, along with Gemini 2.5 Flash integration for chat responses.

## Environment Variables

Create a `.env.local` file in the root directory with:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your Gemini API key from: https://makersuite.google.com/app/apikey

## MCP Server Configuration

The MCP client is configured to connect to your server at:
- **Command**: `uv`
- **Args**: `["run", "main.py"]`
- **Working Directory**: `F:/code n shit/Wakalat-AI-Backend`

You can change this configuration using the MCP Connection Panel UI (bottom-right corner).

## Features

### 1. MCP Connection Panel
- **Location**: Bottom-right corner floating button
- **Features**:
  - View connection status
  - Connect/Disconnect from MCP server
  - Configure connection settings
  - Real-time status updates

### 2. Gemini Integration
- Uses Gemini 1.5 Flash for chat responses
- Supports streaming responses
- Integrates with MCP tools when connected
- Handles conversation history

### 3. Chat Flow
1. User submits a case (text, form, or document)
2. Chat is created with user message
3. Gemini generates response (with MCP tool integration if connected)
4. Response streams in real-time
5. User can continue conversation

## API Routes

### MCP Routes
- `POST /api/mcp/connect` - Connect/disconnect/check status
- `GET /api/mcp/tools` - List available MCP tools
- `POST /api/mcp/tools` - Call an MCP tool

### Gemini Routes
- `POST /api/gemini/chat` - Non-streaming chat
- `POST /api/gemini/stream` - Streaming chat

## Usage

1. **Set up environment variables** (see above)
2. **Start the development server**: `npm run dev`
3. **Connect to MCP server** using the connection panel
4. **Submit cases** - they will use Gemini with MCP integration

## Troubleshooting

### MCP Connection Issues
- Ensure your MCP server is running
- Check that the path `F:/code n shit/Wakalat-AI-Backend` exists
- Verify `uv` command is available in PATH
- Check server logs for errors

### Gemini API Issues
- Verify `GEMINI_API_KEY` is set correctly
- Check API quota/limits
- Ensure internet connection is active

### Streaming Not Working
- Check browser console for errors
- Verify API route is accessible
- Check network tab for failed requests

## Files Created

- `src/lib/mcp-client.ts` - MCP client manager
- `src/lib/gemini-agent.ts` - Gemini agent service
- `src/store/mcpStore.ts` - MCP connection state management
- `src/components/MCPConnectionPanel.tsx` - Connection UI
- `src/app/api/mcp/connect/route.ts` - MCP connection API
- `src/app/api/mcp/tools/route.ts` - MCP tools API
- `src/app/api/gemini/chat/route.ts` - Gemini chat API
- `src/app/api/gemini/stream/route.ts` - Gemini streaming API

## Next Steps

1. Test the MCP connection
2. Verify Gemini responses
3. Integrate MCP tools into the chat flow
4. Customize tool selection logic based on user messages

