# Input limits and local HTTP use

SDK stdio (`--sdk`) and HTTP (`--http`) reject tool arguments containing more than 10,000 total object members plus array elements, counted recursively, before tool input-schema validation and the tool handler. The SDK envelope is processed before that guard. This is not a byte-size or whole-process memory cap; large strings and protocol messages require separate controls.

HTTP JSON bodies retain the 1 MiB limit. Compressed request bodies (gzip, deflate and br) are explicitly unsupported and return 415: send uncompressed JSON. This is an intentional compatibility restriction.

Default lite stdio does not load the SDK and is not covered by its element limit. Its framing buffer has no size bound. The dependency update also includes patched Zod validation, but is not a global memory-safety guarantee.

HTTP binds 127.0.0.1 by default. A custom DELX_MEMORY_HOST does not add authentication. CORS does not authenticate clients. Do not expose this transport to untrusted networks without separate authentication and appropriate access controls.
