import type {EntryContext} from '@shopify/remix-oxygen';
import {RemixServer} from '@remix-run/react';
import isbot from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import {createContentSecurityPolicy} from '@shopify/hydrogen';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  const {nonce, header, NonceProvider} = createContentSecurityPolicy();

  const body = await renderToReadableStream(
    <NonceProvider>
      <RemixServer context={remixContext} url={request.url} />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        // eslint-disable-next-line no-console
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Content-Security-Policy', header);
  responseHeaders.set(
    'Link',
    httpPushLinks(remixContext)
      .map(
        (link: string) =>
          `<${link}>; rel=preload; as=script; crossorigin=anonymous`,
      )
      .concat(responseHeaders.get('Link') as string)
      .filter(Boolean)
      .join(','),
  );
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}

function httpPushLinks(remixContext: EntryContext) {
  return [
    remixContext.manifest.url,
    remixContext.manifest.entry.module,
    ...remixContext.manifest.entry.imports,
  ];
}
