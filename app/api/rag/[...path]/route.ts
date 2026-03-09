import { NextRequest, NextResponse } from "next/server";
import { CookieOptions, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Use a server-only env var (not NEXT_PUBLIC_*) to avoid leaking the internal
// backend URL into the client bundle.
const RAG_API_URL = process.env.RAG_API_URL || process.env.NEXT_PUBLIC_RAG_API_URL || "http://127.0.0.1:8000";
const RAG_API_KEY = process.env.RAG_API_KEY || "";

export async function GET(request: NextRequest) {
    return proxyRequest(request);
}

export async function POST(request: NextRequest) {
    return proxyRequest(request);
}

export async function DELETE(request: NextRequest) {
    return proxyRequest(request);
}

async function proxyRequest(request: NextRequest) {
    // 0. Fail fast if RAG_API_KEY is not configured
    if (!RAG_API_KEY) {
        console.error("[Proxy Error]: RAG_API_KEY environment variable is not set.");
        return NextResponse.json(
            { detail: "Server misconfiguration: backend API key not set." },
            { status: 500 }
        );
    }

    // 1. Verify Authentication
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    } catch {
                        // The `set` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    // 2. Construct Backend URL (extract the path segment after /api/rag/)
    // e.g. /api/rag/documents -> documents
    // e.g. /api/rag/documents/doc1 -> documents/doc1
    const match = request.nextUrl.pathname.match(/^\/api\/rag\/(.*)$/);
    const path = match ? match[1] : "";

    // Pass query parameters along to the backend
    const queryString = request.nextUrl.search;
    const backendUrl = `${RAG_API_URL}/${path}${queryString}`;

    // 3. Prepare headers
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${RAG_API_KEY}`);

    // Forward Content-Type if present (important for file uploads vs JSON)
    const contentType = request.headers.get("Content-Type");
    if (contentType) {
        headers.set("Content-Type", contentType);
    }

    // 4. Forward the request — stream the body instead of buffering
    try {
        const fetchOptions: RequestInit = {
            method: request.method,
            headers: headers,
            // Stream the body directly instead of buffering via .blob()
            // For GET/HEAD requests, body must be omitted.
            body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
            // Disable caching for proxy requests
            cache: "no-store",
            // @ts-expect-error -- Next.js extended fetch supports duplex for streaming
            duplex: "half",
        };

        const response = await fetch(backendUrl, fetchOptions);

        // 5. Stream the response back to the client
        const responseHeaders = new Headers(response.headers);
        // Remove headers that might cause issues when proxying
        responseHeaders.delete("content-encoding");
        responseHeaders.delete("transfer-encoding");

        return new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (error: unknown) {
        console.error("[Proxy Error]:", error);
        return NextResponse.json(
            { detail: "Backend connection failed" },
            { status: 502 }
        );
    }
}
