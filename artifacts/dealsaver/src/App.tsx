import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import HomePage from '@/pages/home';
import AdminPage from '@/pages/admin';
import NotFound from '@/pages/not-found';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#315f50',
    colorForeground: '#263a34',
    colorMutedForeground: '#6e7d76',
    colorDanger: '#b94a3f',
    colorBackground: '#fffdf8',
    colorInput: '#fffdf8',
    colorInputForeground: '#263a34',
    colorNeutral: '#ddd8cc',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf8] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#263a34] font-semibold tracking-tight',
    headerSubtitle: 'text-[#6e7d76]',
    socialButtonsBlockButtonText: 'text-[#263a34] font-medium',
    formFieldLabel: 'text-[#263a34] font-medium',
    footerActionLink: 'text-[#315f50] font-semibold',
    footerActionText: 'text-[#6e7d76]',
    dividerText: 'text-[#6e7d76]',
    identityPreviewEditButton: 'text-[#315f50]',
    formFieldSuccessText: 'text-[#315f50]',
    alertText: 'text-[#8f3830]',
    logoBox: 'mb-2',
    logoImage: 'h-9',
    socialButtonsBlockButton: 'border-[#ddd8cc] bg-[#fffdf8] hover:bg-[#f6f1e7]',
    formButtonPrimary: 'bg-[#315f50] hover:bg-[#284d41] text-white',
    formFieldInput: 'border-[#ddd8cc] bg-[#fffdf8] text-[#263a34]',
    footerAction: 'border-t border-[#e9e4d9]',
    dividerLine: 'bg-[#e9e4d9]',
    alert: 'border-[#e5c7c0] bg-[#fbefeb]',
    otpCodeFieldInput: 'border-[#ddd8cc] bg-[#fffdf8] text-[#263a34]',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) cache.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, cache]);
  return null;
}

function AdminRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="auth-loading" data-testid="loading-admin-auth"><span /><span /><span /></div>;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <AdminPage />;
}

function HomeRoute() {
  return <><Show when="signed-in"><div className="signed-in-admin-hint"><span>You’re signed in.</span><Link href="/admin" data-testid="link-signed-in-admin">Open deal manager <span>→</span></Link></div></Show><HomePage /></>;
}

function SignInPage() {
  return <div className="auth-page"><div className="auth-back"><Link href="/" className="wordmark" data-testid="link-auth-home"><span className="brand-mark"><i /><i /><i /></span><span>deal<span className="wordmark-accent">saver</span></span></Link><p>Hand-picked finds, thoughtfully shared.</p></div><div className="auth-inner"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div><div className="auth-side-note">A good find is always worth sharing.<span>DEALSAVER / CURATION DESK</span></div></div>;
}
function SignUpPage() {
  return <div className="auth-page"><div className="auth-back"><Link href="/" className="wordmark" data-testid="link-auth-home"><span className="brand-mark"><i /><i /><i /></span><span>deal<span className="wordmark-accent">saver</span></span></Link><p>Hand-picked finds, thoughtfully shared.</p></div><div className="auth-inner"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div><div className="auth-side-note">A good find is always worth sharing.<span>DEALSAVER / CURATION DESK</span></div></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to manage your DealSaver edit.' } },
      signUp: { start: { title: 'Create an owner account', subtitle: 'Set up your DealSaver access.' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <RoutedErrorBoundary><Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/admin" component={AdminRoute} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch></RoutedErrorBoundary>
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => undefined);
  }, []);
  return <TooltipProvider><WouterRouter base={basePath}><ClerkRoutes /></WouterRouter><Toaster /></TooltipProvider>;
}

export default App;