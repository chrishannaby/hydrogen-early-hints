import type {EntryContext} from '@shopify/remix-oxygen';
import {RemixServer, matchRoutes} from '@remix-run/react';
import isbot from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import {createContentSecurityPolicy} from '@shopify/hydrogen';
import {EntryRoute} from '@remix-run/react/dist/routes';

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
    earlyHints(remixContext, request)
      .concat(responseHeaders.get('Link') as string)
      .join(', '),
  );
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}

function earlyHints(remixContext: EntryContext, request: Request) {
  const matches = matchRoutes(
    Object.values(remixContext.manifest.routes),
    new URL(request.url).pathname,
  );
  const links = (matches || []).flatMap((match) => {
    const parentLinks =
      remixContext.routeModules[match.route?.parentId || ''].links;
    const routeLinks = remixContext.routeModules[match.route.id].links;
    return [
      ...(parentLinks ? parentLinks() : []),
      ...(routeLinks ? routeLinks() : []),
    ];
  });

  const earlyHints = links
    .map((link) => {
      if ('href' in link) {
        switch (link.rel) {
          case 'stylesheet':
            return `<${link.href}>; rel=preload; as=style`;
          case 'script':
            return `<${link.href}>; rel=preload; as=script`;
          case 'preconnect':
            return `<${link.href}>; rel=preconnect`;
          default:
            return;
        }
      }
    })
    .filter(Boolean);

  return earlyHints;
}
