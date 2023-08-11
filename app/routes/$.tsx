import type {LoaderArgs, ActionArgs} from '@shopify/remix-oxygen';

const config = {
  removeNoIndex: true, // Set to false if you want to respect robots noindex tags
  updateCanonical: true, // Set to false if you want to respect canonical meta tags
  ignoreRedirects: true, // Set to false if you aren't redirecting to Hydrogen in your theme
};

export async function action({context, request}: ActionArgs) {
  const {
    shop: {
      primaryDomain: {url},
    },
  } = await context.storefront.query(
    `#graphql
      query {
        shop {
          primaryDomain {
            url
          }
        }
      }
    `,
    {
      cache: context.storefront.CacheLong(),
    },
  );

  const {pathname, search} = new URL(request.url);
  const newUrl = url + pathname + search;

  const newRequest = new Request(
    newUrl,
    new Request(request, {
      redirect: 'manual',
    }),
  );
  try {
    return await fetch(newRequest);
  } catch (e: any) {
    return new Response(JSON.stringify({error: e.message}), {
      status: 500,
    });
  }
}

export async function loader({request, context}: LoaderArgs) {
  const {
    shop: {
      primaryDomain: {url},
    },
  } = await context.storefront.query(
    `#graphql
      query {
        shop {
          primaryDomain {
            url
          }
        }
      }
    `,
    {
      cache: context.storefront.CacheLong(),
    },
  );

  const {origin, pathname, search} = new URL(request.url);

  const response = await fetch(
    url + pathname + search,
    new Request(request, {
      redirect: 'manual',
    }),
  );

  const data = await response.text();

  const processedData = data
    .replace(
      /<meta.*name="robots".*content="noindex.*".*>|<link.*rel="canonical".*href=".*".*>|("monorailRegion":"shop_domain")|<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      (match) => {
        if (match.startsWith('<meta') && config.removeNoIndex) return '';
        if (match.startsWith('<link') && config.updateCanonical)
          return match.replace(url, origin);
        if (match.startsWith('"monorailRegion"'))
          return '"monorailRegion":"global"';
        if (match.startsWith('<script') && config.ignoreRedirects)
          return match.replace(/window\.location\.replace\([^)]*\);?/g, '');
        return match;
      },
    )
    .replace(new RegExp(url, 'g'), origin);

  const status = /<title>(.|\n)*404 Not Found(.|\n)*<\/title>/i.test(data)
    ? 404
    : response.status;

  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html');
  headers.delete('content-encoding');
  headers.set('Cache-Control', 'public, max-age=1, must-revalidate=9');

  return new Response(processedData, {status, headers});
}
