import PropTypes from 'prop-types';
import React, { Suspense, useContext, useEffect, useMemo, useState } from 'react';
import { isLazy } from 'react-is';
import { createRouteContext, findRoute, processRoute, route, valid } from './utils';

const ButtermilkContext = React.createContext();
const BROWSER = typeof window !== 'undefined';
const NOOP = function() {};
let noFallbackWarningEmitted = false;

/**
 * The gist of Buttermilk's router is that it acts like a controlled component when used
 * server-side (driven by `props.url`) and an uncontrolled one client-side (driven by the
 * value of `window.location.href` and intercepted navigation events.)
 *
 * In the browser, use either a <Link> component or the route() method to change routes.
 * The router will also automatically pick up popstate events caused by user-driven browser
 * navigation (forward, back buttons, etc.)
 */
export function Router(props) {
  if (!BROWSER && !props.url) {
    throw new Error('props.url is required for non-browser environments');
  }

  // this is entirely derived from props so useMemo works fine
  const routes = useMemo(() => processRoutes(props.routes), [props.routes]);

  const [routingState, updateRoutingState] = useState(
    getStateUpdateForUrl(routes, props.url || window.location.href, null)
  );

  // an internal redirect may happen in getStateUpdateForUrl -> findRoute, so we'll use the final returned url
  const [url, updateUrl] = useState(routingState.url);

  // this effect triggers the update flow in a controlled Router or SSR use case
  useEffect(() => updateUrl(props.url || routingState.url), [props.url]);

  useEffect(() => {
    props.routerDidInitialize(routingState.routingProps);

    function handleLocationChange() {
      updateUrl(window.location.href);
    }

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    const { route: nextRoute, url: nextUrl } = findRoute(routes, url);

    if (nextRoute !== routingState.activeRoute || nextUrl !== routingState.url) {
      const nextRoutingProps = createRouteContext(nextRoute, nextUrl);
      const result = props.routeWillChange(routingState.routingProps, nextRoutingProps);

      const finish = () => {
        updateRoutingState(getStateUpdateForUrl(routes, nextUrl, routingState.routingProps));
        updateUrl(nextUrl);
      };

      if (result === false) return;
      else if (result instanceof Promise) result.then(finish, NOOP);
      else finish();
    }
  }, [routes, url]);

  useEffect(() => {
    if (routingState.prevRoutingProps) props.routeDidChange(routingState.routingProps, routingState.prevRoutingProps);
  }, [routingState.routingProps.route, routingState.routingProps.location]);

  const Renderable = routingState.children;
  const children = !React.isValidElement(Renderable) ? <Renderable {...routingState.routingProps} /> : Renderable;

  return (
    <ButtermilkContext.Provider value={routingState.routingProps}>
      <props.outerComponent {...routingState.routingProps}>
        {isLazy(Renderable) ? <Suspense fallback={<props.loadingComponent />}>{children}</Suspense> : children}
      </props.outerComponent>
    </ButtermilkContext.Provider>
  );
}

Router.propTypes = {
  /**
   * Provide a spinner or something to look at while the promise
   * is in flight if using async routes.
   */
  loadingComponent: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),

  /**
   * An optional app runtime component. Think of it like the "shell" of your
   * app, so perhaps the outer container, nav bar, etc. You'll probably want to
   * put any "Provider" type components here that are intended to wrap your
   * whole application.
   */
  outerComponent: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),

  routes: PropTypes.arrayOf(
    PropTypes.shape({
      /**
       * A RegExp, string, or function accepting the URL as
       * an argument and returning a boolean if valid.
       */
      path: PropTypes.oneOfType([PropTypes.instanceOf(RegExp), PropTypes.string, PropTypes.func]).isRequired,

      /**
       * A string URL path to a different route. If this is given,
       * then "render" is not required.
       */
      redirect: PropTypes.string,

      /**
       * A function that returns one of the following:
       *
       * 1. JSX.
       * 2. A React component class.
       * 3. A promise resolving to JSX or a React component class.
       */
      render: PropTypes.func,
    })
  ).isRequired,

  /**
   * A hook for reacting to an impending route transition. Accepts a promise
   * and will pause the route transition until the promise is resolved. Return
   * false or reject a given promise to abort the routing update.
   *
   * Provides currentRouting and nextRouting as arguments.
   */
  routeWillChange: PropTypes.func,

  /**
   * A hook for reacting to a completed route transition. It might be used
   * for synchronizing some global state if desired.
   *
   * Provides currentRouting and previousRouting as arguments.
   */
  routeDidChange: PropTypes.func,

  /**
   * A hook for synchronizing initial routing state.
   *
   * Providers initialRouting as an argument.
   */
  routerDidInitialize: PropTypes.func,

  /**
   * The initial URL to be used for processing, falls back to
   * window.location.href for non-SSR. Required for environments without
   * browser navigation eventing.
   */
  url: PropTypes.string,
};

Router.defaultProps = {
  loadingComponent: 'div',
  outerComponent: 'div',
  routeDidChange: NOOP,
  routeWillChange: NOOP,
  routerDidInitialize: NOOP,
  url: '',
};

function getStateUpdateForUrl(routes, url, prevRoutingProps) {
  const result = findRoute(routes, url);
  const nextRoutingProps = createRouteContext(result.route, result.url);

  return {
    activeRoute: result.route,
    children: result.route.render(nextRoutingProps),
    prevRoutingProps,
    routes,
    routingProps: nextRoutingProps,
    url: result.url,
  };
}

function processRoutes(routes) {
  if (process.env.NODE_ENV !== 'production') {
    if (!noFallbackWarningEmitted && routes.every(route => route.path !== '*')) {
      console.warn('no fallback route "*" was supplied. if a matching route is not found, the router will throw');
      noFallbackWarningEmitted = true;
    }
  }

  return routes.map(processRoute);
}

/**
 * Allows for obtaining routingState with the `useContext` hook.
 */
export const RoutingContext = ButtermilkContext;

/**
 * Compose it like this:
 *
 * <RoutingState>
 *   {({ location, params, route }) => {
 *      return <div>{location.pathname}</div>
 *   }}
 * </RoutingState>
 */
export const RoutingState = ButtermilkContext.Consumer;

/**
 * A polymorphic anchor link component. On click/tap/enter if the destination
 * matches a value route, the routing context will be modified without
 * reloading the page. Otherwise, it will act like a normal anchor link.
 *
 * If something other than an anchor tag is specified via props.as, a
 * [role="link"] attribute will be added for basic assistive technology support.
 *
 * Adds [data-active] if the given href matches the active route.
 */
export const Link = React.forwardRef(function ButtermilkLink(props, ref) {
  const routingState = useContext(ButtermilkContext);

  return React.createElement(
    props.as || 'a',
    Object.assign({}, props, {
      'data-active': valid(routingState.route.test, props.href) ? '' : undefined,
      'data-href': props.href,
      as: undefined,
      href: shouldRenderAnchorProps(props) ? props.href : undefined,
      ref,
      role: shouldRenderRole(props) ? 'link' : undefined,
      onClick: handleNavigationIntent,
      tabIndex: props.tabIndex || 0,
      target: shouldRenderAnchorProps(props) ? props.target : undefined,
    })
  );
});

Link.propTypes = {
  /**
   * An HTML tag name or valid ReactComponent class to be rendered. Must
   * be compatible with React.createElement.
   *
   * Defaults to an anchor "a" tag.
   */
  as: PropTypes.oneOfType([PropTypes.func, PropTypes.string, PropTypes.object]),

  /**
   * A valid relative or absolute URL string.
   */
  href: PropTypes.string.isRequired,

  /**
   * Any valid value of the anchor tag "target" attribute.
   *
   * See: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a#attr-target
   */
  target: PropTypes.string,
};

function shouldRenderAnchorProps(props) {
  return props.as === 'a' || typeof props.as !== 'string';
}

function shouldRenderRole(props) {
  return props.as !== 'a';
}

function handleNavigationIntent(event) {
  event.preventDefault();
  event.stopPropagation();

  const href = event.target.getAttribute('data-href');

  if (event.metaKey || event.target.getAttribute('target') === '_blank') {
    window.open(href);
  } else {
    route(href);
  }
}
