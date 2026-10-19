import Link from 'next/link';
import { ChevronDown, KeyRound, MessageSquareText, ShieldCheck, Smartphone } from 'lucide-react';
import { AccentWord } from '@/components/accent-word';
import { Reveal } from '@/components/motion/reveal';
import { Stagger, StaggerItem } from '@/components/motion/stagger';
import { Logo } from '@/components/brand/logo';
import { HeaderActions, PrimaryCta } from '@/components/landing/auth-cta';
import { CurrenciesVisual, StatementVisual, SubscriptionsVisual } from '@/components/landing/feature-visuals';
import { ProductPreview } from '@/components/landing/product-preview';

const steps = [
  {
    title: 'Forward your bank SMS',
    body: 'A small forwarder on your phone sends your bank’s messages here. Nothing else on your phone is read.',
  },
  {
    title: 'Each message becomes a transaction',
    body: 'Amount, merchant, card and currency are read from the text and filed under a category.',
  },
  {
    title: 'See it all, fix things in a tap',
    body: 'Spending by category for each currency. Anything the app wasn’t sure about waits in one inbox.',
  },
];

const features = [
  {
    id: 'currencies',
    title: 'Pounds and dollars, never blended',
    body: 'EGP and USD each get their own totals, categories and comparisons. A foreign charge shows both the price you saw and what your card was actually charged.',
    Visual: CurrenciesVisual,
  },
  {
    id: 'statements',
    title: 'Statements fill in what messages miss',
    body: 'Upload your credit card statement and it matches every line to the SMS already recorded. Fees, cashback and the EGP price of foreign purchases are added for you. Importing the same month twice is harmless.',
    Visual: StatementVisual,
  },
  {
    id: 'subscriptions',
    title: 'Subscriptions find themselves',
    body: 'Charges that repeat on a steady schedule are suggested as subscriptions. Once tracked, you see what each costs per month and per year, and get a gentle heads-up when a price changes or a charge doesn’t show up.',
    Visual: SubscriptionsVisual,
  },
];

const privacy = [
  { icon: KeyRound, title: 'No bank passwords, ever', body: 'The app never connects to your bank. It only reads messages you choose to forward.' },
  { icon: ShieldCheck, title: 'Sessions that end themselves', body: 'Sign-ins expire on their own, and you can sign out every device at once.' },
  { icon: Smartphone, title: 'Your phone, your switch', body: 'Each phone gets its own key. Revoke one and it stops sending immediately.' },
];

const faqs = [
  {
    q: 'Do I need to give you my bank login?',
    a: 'No. The app never talks to your bank. It reads the SMS your bank already sends you, and only the ones your phone forwards.',
  },
  {
    q: 'Which banks work?',
    a: 'It reads the message formats it has been taught, and more are added over time. A message it can’t read isn’t lost: it waits in your SMS inbox so nothing slips through.',
  },
  {
    q: 'What happens with purchases in dollars on an EGP card?',
    a: 'You see the dollar price straight away. The exact EGP amount is filled in when you import that month’s card statement.',
  },
  {
    q: 'Can I use it on my phone?',
    a: 'Yes. It works in any modern browser, on phone and desktop, in light or dark mode.',
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-transparent bg-background/90 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Logo />
          </Link>
          <nav aria-label="Page sections" className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#privacy" className="hover:text-foreground">Privacy</a>
            <a href="#faq" className="hover:text-foreground">Questions</a>
          </nav>
          <HeaderActions />
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-12 pb-20 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-20 lg:pb-28">
          <Stagger>
            <StaggerItem index={0}>
              <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <MessageSquareText aria-hidden="true" className="size-3.5 text-accent-foreground" />
                Made for banking in Egypt, in EGP and USD
              </p>
            </StaggerItem>
            <StaggerItem index={1}>
              <h1 className="mt-6 font-display text-[clamp(2.5rem,5.5vw,4.25rem)] leading-[1.02] tracking-[-0.015em] text-balance">
                Your bank already texts you <AccentWord>every purchase.</AccentWord>
              </h1>
            </StaggerItem>
            <StaggerItem index={2}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
                Finance turns those messages into a calm, clear picture of where your money goes. No typing, no
                spreadsheets, no bank passwords.
              </p>
            </StaggerItem>
            <StaggerItem index={3}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <PrimaryCta />
                <a
                  href="#how"
                  className="inline-flex h-12 items-center gap-1.5 rounded-xl px-4 text-base font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  See how it works
                  <ChevronDown aria-hidden="true" className="size-4" />
                </a>
              </div>
            </StaggerItem>
          </Stagger>
          <div>
            <ProductPreview />
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-heading" className="scroll-mt-20 border-y bg-sidebar">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <Reveal>
              <h2 id="how-heading" className="max-w-2xl font-display text-[clamp(1.9rem,3.5vw,2.75rem)] leading-tight tracking-tight text-balance">
                Set it up once. After that, spending records itself.
              </h2>
            </Reveal>
            <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 0.08} className="relative md:pe-6">
                  <span className="font-heading text-5xl font-semibold text-chart-1" aria-hidden="true">
                    {i + 1}
                  </span>
                  {i < steps.length - 1 && (
                    <span aria-hidden="true" className="absolute top-7 start-14 end-0 hidden h-px bg-border md:block" />
                  )}
                  <h3 className="mt-4 text-lg font-semibold">
                    <span className="sr-only">Step {i + 1}: </span>
                    {s.title}
                  </h3>
                  <p className="mt-2 text-muted-foreground text-pretty">{s.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Features, alternating sides */}
        <section id="features" aria-label="Features" className="mx-auto max-w-6xl scroll-mt-20 space-y-24 px-5 py-24 sm:px-8 lg:space-y-32 lg:py-32">
          {features.map(({ id, title, body, Visual }, i) => (
            <Reveal as="article" key={id} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
              <div className={i % 2 === 1 ? 'lg:order-2' : undefined}>
                <h2 className="font-display text-[clamp(1.7rem,3vw,2.4rem)] leading-tight tracking-tight text-balance">
                  {title}
                </h2>
                <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground text-pretty">{body}</p>
              </div>
              <div className={i % 2 === 1 ? 'lg:order-1' : undefined}>
                <Visual />
              </div>
            </Reveal>
          ))}
        </section>

        {/* Privacy */}
        <section id="privacy" aria-labelledby="privacy-heading" className="scroll-mt-20 border-y bg-sidebar">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:py-24">
            <Reveal>
              <h2 id="privacy-heading" className="font-display text-[clamp(1.9rem,3.5vw,2.75rem)] leading-tight tracking-tight">
                Private by design
              </h2>
              <p className="mt-4 max-w-md text-muted-foreground text-pretty">
                Money is personal. The app is built so the most sensitive things never reach it in the first place.
              </p>
            </Reveal>
            <ul className="space-y-8">
              {privacy.map(({ icon: Icon, title, body }, i) => (
                <Reveal as="li" key={title} delay={i * 0.08} className="flex gap-4">
                  <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-foreground" />
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-muted-foreground">{body}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-heading" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-24 sm:px-8">
          <Reveal>
            <h2 id="faq-heading" className="font-display text-[clamp(1.9rem,3.5vw,2.75rem)] leading-tight tracking-tight">
              Questions, answered
            </h2>
          </Reveal>
          <div className="mt-10 divide-y border-y">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.05}>
                <details className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-lg font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 max-w-2xl text-muted-foreground text-pretty">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Closing band */}
        <section className="px-5 pb-24 sm:px-8">
          <div className="mx-auto max-w-6xl rounded-3xl bg-primary px-8 py-16 text-primary-foreground sm:px-14 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:py-20">
            <h2 className="max-w-xl font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-tight text-balance">
              Stop typing expenses. <em className="italic">Start seeing them.</em>
            </h2>
            <div className="mt-8 shrink-0 lg:mt-0">
              <PrimaryCta tone="ink" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <p>© {new Date().getFullYear()} Finance. A personal project, built with care.</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-foreground">Log in</Link>
            <Link href="/register" className="hover:text-foreground">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
