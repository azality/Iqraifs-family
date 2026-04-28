import { useNavigate } from 'react-router';
import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import {
  Heart,
  Shield,
  Sparkles,
  CheckCircle2,
  Star,
  Users,
  BookOpen,
  Trophy,
  Gift,
  Compass,
  Calendar,
  ScrollText,
  KeyRound,
  Bell,
  Menu,
  X,
  ArrowRight,
} from 'lucide-react';

// ---- Section: Top Nav ---------------------------------------------------
function TopNav() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { label: 'Why FGS', href: '#why' },
    { label: 'How it works', href: '#how' },
    { label: 'Features', href: '#features' },
    { label: 'FAQ', href: '#faq' },
  ];

  const goTo = (hash: string) => {
    setMenuOpen(false);
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2"
          aria-label="FGS home"
        >
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
            ﷽
          </div>
          <span className="font-bold text-gray-900 text-lg">FGS</span>
          <span className="hidden sm:inline text-gray-500 text-sm">Family Goal System</span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <button
              key={l.href}
              onClick={() => goTo(l.href)}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate('/login')} className="text-gray-700">
            Sign In
          </Button>
          <Button
            onClick={() => navigate('/signup')}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            Get Started
          </Button>
        </div>

        {/* Mobile burger */}
        <button
          className="md:hidden p-2 -mr-2 text-gray-700"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-4 py-4 space-y-2">
            {links.map((l) => (
              <button
                key={l.href}
                onClick={() => goTo(l.href)}
                className="block w-full text-left py-2 text-gray-700 hover:text-gray-900"
              >
                {l.label}
              </button>
            ))}
            <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => navigate('/login')}>
                Sign In
              </Button>
              <Button
                onClick={() => navigate('/signup')}
                className="bg-gradient-to-r from-blue-600 to-indigo-600"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// ---- Section: Hero ------------------------------------------------------
function Hero() {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden">
      {/* soft background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50" />
      <div className="absolute -top-32 -right-32 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="absolute -bottom-40 -left-32 h-80 w-80 rounded-full bg-purple-200/40 blur-3xl" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: copy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-blue-100 text-blue-700 text-sm mb-6">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              Built for Muslim families
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.05]">
              Build better habits.{' '}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Stronger values.
              </span>{' '}
              A closer family.
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-xl">
              FGS turns the things that matter — salah, character, knowledge of the deen — into
              real, observable progress. Honest by construction. Built for the Muslim home.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                onClick={() => navigate('/signup')}
                className="h-12 px-7 text-base bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/login')}
                className="h-12 px-7 text-base"
              >
                Sign In
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> No credit card
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Family-private by design
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Web, iOS &amp; Android
              </span>
            </div>
          </motion.div>

          {/* Right: phone-style mock */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="rounded-3xl bg-white shadow-2xl ring-1 ring-gray-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-200 to-orange-300 flex items-center justify-center text-xl">
                    👦
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Asalaamu alaikum</div>
                    <div className="font-semibold text-gray-900">Yusuf</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    1,247
                  </div>
                  <div className="text-xs text-gray-500">points</div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-700">Today&rsquo;s Salah</div>
                  <div className="text-xs text-gray-500">3 of 5</div>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  {['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((p, i) => (
                    <div
                      key={p}
                      className={`text-center text-[10px] px-1 py-2 rounded-lg ${
                        i < 3
                          ? 'bg-emerald-100 text-emerald-700 font-semibold'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {p}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 p-4 bg-gradient-to-br from-amber-50 to-orange-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-amber-700 font-semibold">
                      Daily Quest
                    </div>
                    <div className="font-semibold text-gray-900 mt-0.5">7-day Fajr Streak</div>
                  </div>
                  <Trophy className="h-6 w-6 text-amber-500" />
                </div>
                <div className="mt-3 h-2 rounded-full bg-amber-100 overflow-hidden">
                  <div className="h-full w-[70%] bg-gradient-to-r from-amber-400 to-orange-500" />
                </div>
                <div className="mt-1 text-xs text-amber-700">5 of 7 days complete</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-gray-100 p-3">
                  <BookOpen className="h-5 w-5 text-blue-600 mb-1" />
                  <div className="text-xs font-semibold text-gray-700">Knowledge Quest</div>
                  <div className="text-xs text-gray-500">3 questions left today</div>
                </div>
                <div className="rounded-2xl border border-gray-100 p-3">
                  <Gift className="h-5 w-5 text-pink-500 mb-1" />
                  <div className="text-xs font-semibold text-gray-700">Wishlist</div>
                  <div className="text-xs text-gray-500">Closer to your goal</div>
                </div>
              </div>
            </div>

            {/* floating little badges */}
            <div className="absolute -top-3 -right-3 hidden sm:flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 shadow-md ring-1 ring-gray-100 text-xs font-semibold text-emerald-700">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> +25 points
            </div>
            <div className="absolute -bottom-4 -left-3 hidden sm:flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 shadow-md ring-1 ring-gray-100 text-xs font-semibold text-amber-700">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> Streak King
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ---- Section: Why FGS ---------------------------------------------------
function WhyFGS() {
  const pillars = [
    {
      icon: Heart,
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-600',
      title: 'Built for the Muslim home',
      body:
        'Salah with on-time / qadha / missed semantics. Sadqa, knowledge of the deen, and ahadith are first-class concepts — not afterthoughts.',
    },
    {
      icon: Shield,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      title: 'Honest by construction',
      body:
        'Every credit and debit is a row in an append-only event log. Corrections are recorded as new events. Nothing is silently rewritten.',
    },
    {
      icon: Sparkles,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      title: 'Engages without shame',
      body:
        'Game mechanics, badges, streaks, and an Adventure World — but kids never see negative entries. Correction happens through conversation, not punishment.',
    },
  ];

  return (
    <section id="why" className="py-20 sm:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wide">
            Why FGS
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">
            A different kind of family app
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Most chore apps are toy economies. FGS is built around the things that actually matter
            in a Muslim household — and treats your family&rsquo;s data with the seriousness it
            deserves.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {pillars.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <Card className="h-full border-gray-100 hover:shadow-xl transition-shadow">
                <CardContent className="p-7">
                  <div className={`h-12 w-12 rounded-xl ${p.iconBg} flex items-center justify-center mb-4`}>
                    <p.icon className={`h-6 w-6 ${p.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">{p.title}</h3>
                  <p className="mt-2 text-gray-600">{p.body}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Section: How it works ----------------------------------------------
function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'Set up your family',
      body: 'Add your children, configure salah for your madhhab, and define the behaviors that matter in your home.',
    },
    {
      n: '2',
      title: 'Log and approve',
      body: 'A tap to log a behavior. A tap to approve a prayer. Everything goes into the family ledger automatically.',
    },
    {
      n: '3',
      title: 'Kids engage and grow',
      body: 'Kids see their dashboard, complete quests, earn badges, and explore the Adventure World — Makkah, Madinah, Quran Valley.',
    },
    {
      n: '4',
      title: 'Audit, correct, never lie',
      body: 'Every event is reconstructable. Disagree with an entry? Correct it as a new event. The original stays visible.',
    },
  ];

  return (
    <section id="how" className="py-20 sm:py-24 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-block px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold uppercase tracking-wide">
            How it works
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">Four steps. Then habit.</h2>
          <p className="mt-4 text-lg text-gray-600">
            FGS is designed to be set up in an evening and used for years.
          </p>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative"
            >
              <div className="flex items-start gap-4 lg:flex-col lg:gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xl flex items-center justify-center shadow-lg shrink-0">
                  {s.n}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{s.title}</h3>
                  <p className="mt-1.5 text-gray-600 text-sm leading-relaxed">{s.body}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Section: For Parents -----------------------------------------------
function ForParents() {
  const features = [
    {
      icon: Calendar,
      title: 'A real command center',
      body:
        'Quick log, pending approvals, recent points, and per-child summaries on a single dashboard. The frequent things sit at the top.',
    },
    {
      icon: Users,
      title: 'Roles for the whole family',
      body:
        'Primary parent, secondary parent, and per-kid guardians (a tutor, a grandparent). Each role sees exactly what it should.',
    },
    {
      icon: ScrollText,
      title: 'Audit-grade history',
      body:
        'Every point on a kid&rsquo;s total can be traced to a specific event, item, and approval. Manual adjustments require a reason.',
    },
    {
      icon: KeyRound,
      title: 'Kid PINs, not kid passwords',
      body:
        '4-digit PINs for kids, rate-limited on the server, with weak-PIN warnings on creation and parent-triggered resets.',
    },
  ];

  return (
    <section className="py-20 sm:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-4">
            <div className="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wide">
              For Parents
            </div>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">
              Run your home the way you actually want to.
            </h2>
            <p className="mt-4 text-gray-600 text-lg">
              Less arguing about what was promised. Less guessing about what each kid did this
              week. More time on conversations that matter.
            </p>
            <Button
              className="mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              onClick={() => (window.location.href = '/signup')}
            >
              Create your family <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="lg:col-span-8 grid sm:grid-cols-2 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-6 ring-1 ring-blue-100/50"
              >
                <f.icon className="h-7 w-7 text-blue-600 mb-3" />
                <h3 className="font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Section: For Kids --------------------------------------------------
function ForKids() {
  const features = [
    {
      emoji: '🕋',
      title: 'Adventure World',
      body: 'Explore Makkah, Madinah, Quran Valley, and Desert Trials. Learn the deen as a long-form story, not a flashcard deck.',
    },
    {
      emoji: '🌟',
      title: 'Knowledge Quest',
      body: 'Multiple-choice quests pulled from your family&rsquo;s question bank. Plus immersive plays — Dua Spell Casting, Ayah Puzzle.',
    },
    {
      emoji: '🌳',
      title: 'Jannah Garden',
      body: 'A persistent garden that grows as kids progress. Long-tail meta-progression that rewards consistency over weeks.',
    },
    {
      emoji: '🏆',
      title: 'Titles &amp; Badges',
      body: 'Streak King, Sadqa Champion, Knowledge Seeker, Hafidh of the Month — earned by event-driven rules, not granted by hand.',
    },
  ];

  return (
    <section className="py-20 sm:py-24 bg-gradient-to-br from-amber-50 via-rose-50 to-purple-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold uppercase tracking-wide">
            For Kids
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">
            A game they want to come back to.
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Real progress. Real points. Real rewards. And a world worth exploring.
          </p>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Card className="h-full border-white/60 bg-white/80 backdrop-blur-sm hover:shadow-xl transition-shadow">
                <CardContent className="p-6">
                  <div className="text-4xl mb-3">{f.emoji}</div>
                  <h3 className="font-semibold text-gray-900">{f.title}</h3>
                  <p
                    className="mt-1.5 text-sm text-gray-600 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: f.body }}
                  />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Button
            size="lg"
            variant="outline"
            onClick={() => (window.location.href = '/kid-login-new')}
            className="h-12 px-7 border-2 border-amber-400 hover:bg-amber-50"
          >
            <span className="text-2xl mr-2">👶</span> I&rsquo;m a Kid &mdash; Sign In
          </Button>
        </div>
      </div>
    </section>
  );
}

// ---- Section: Features Grid ---------------------------------------------
function FeaturesGrid() {
  const items = [
    { icon: Calendar, label: 'Salah tracking', detail: 'On-time, qadha, or missed.' },
    { icon: Trophy, label: 'Quests', detail: 'Daily and weekly objectives.' },
    { icon: Sparkles, label: 'Challenges', detail: 'Time-bounded specific goals.' },
    { icon: BookOpen, label: 'Knowledge Quest', detail: 'Family-curated MCQ bank.' },
    { icon: Compass, label: 'Adventure World', detail: 'Four immersive zones.' },
    { icon: Gift, label: 'Wishlist', detail: 'Kid-requested rewards.' },
    { icon: Heart, label: 'Sadqa', detail: 'Voluntary giving tracker.' },
    { icon: Star, label: 'Titles &amp; Badges', detail: 'Long-tail recognition.' },
    { icon: ScrollText, label: 'Audit Trail', detail: 'Append-only event log.' },
    { icon: Users, label: 'Roles &amp; Guardians', detail: 'Owner, parent, guardian.' },
    { icon: Bell, label: 'Push notifications', detail: 'Approval reminders.' },
    { icon: Shield, label: 'Family-private', detail: 'Namespaced data, no leakage.' },
  ];

  return (
    <section id="features" className="py-20 sm:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-block px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold uppercase tracking-wide">
            Everything inside
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">
            A complete platform, not a feature.
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((it) => (
            <div
              key={it.label}
              className="rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
            >
              <it.icon className="h-5 w-5 text-blue-600 mb-2" />
              <div
                className="font-semibold text-gray-900 text-sm"
                dangerouslySetInnerHTML={{ __html: it.label }}
              />
              <div
                className="text-xs text-gray-500 mt-0.5"
                dangerouslySetInnerHTML={{ __html: it.detail }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Section: FAQ -------------------------------------------------------
function FAQ() {
  const items = [
    {
      q: 'Does FGS work on iPhone and Android?',
      a: 'Yes. FGS runs in the browser today and ships as a native iOS and Android app via Capacitor. The same family data syncs across all of them.',
    },
    {
      q: 'How much does it cost?',
      a: 'FGS is free to use right now. Monetization is a deliberate future decision — when and how we charge will be transparent and family-friendly.',
    },
    {
      q: 'How does kid login work?',
      a: 'Each child has a 4-digit PIN. PINs are rate-limited on the server, weak combinations (1234, 0000, sequential digits) are flagged on creation, and parents can reset a PIN at any time.',
    },
    {
      q: 'What happens if I log something wrong?',
      a: 'You can correct any event. Corrections write a new event that references the original — the original is voided but never deleted, so the audit trail stays honest.',
    },
    {
      q: 'Is my family data private?',
      a: 'Yes. Every key in the database is prefixed with your family ID, so cross-family leakage is structurally impossible. Auth is handled by Supabase. There is no third-party analytics inside the kid surface.',
    },
    {
      q: 'Can I add a tutor or grandparent?',
      a: 'Yes. The Guardian role lets you scope another adult&rsquo;s access to specific children — they can log behaviors and approve prayers for the kids you choose, and nothing else.',
    },
    {
      q: 'What if my kid disputes a logged event?',
      a: 'Kids can flag any event as an edit request. It lands in your Edit Requests queue with the original entry and the kid&rsquo;s note, and you can confirm, correct, or dismiss it.',
    },
  ];

  return (
    <section id="faq" className="py-20 sm:py-24 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center">
          <div className="inline-block px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold uppercase tracking-wide">
            FAQ
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-gray-900">
            Frequently asked
          </h2>
        </div>

        <Accordion type="single" collapsible className="mt-10">
          {items.map((it, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-b border-gray-200">
              <AccordionTrigger className="text-left text-gray-900 font-semibold hover:no-underline">
                {it.q}
              </AccordionTrigger>
              <AccordionContent className="text-gray-600 leading-relaxed">
                <span dangerouslySetInnerHTML={{ __html: it.a }} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// ---- Section: Final CTA -------------------------------------------------
function FinalCTA() {
  const navigate = useNavigate();

  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-10 sm:p-14 text-center shadow-2xl">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Start your family&rsquo;s growth today
            </h2>
            <p className="mt-4 text-blue-50 text-lg max-w-xl mx-auto">
              Set up in an evening. Use it for years. Free to start, no credit card required.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                onClick={() => navigate('/signup')}
                className="h-12 px-8 text-base bg-white text-blue-700 hover:bg-blue-50"
              >
                Create your family <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/login')}
                className="h-12 px-8 text-base bg-transparent text-white border-white/40 hover:bg-white/10 hover:text-white"
              >
                I already have an account
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Section: Footer ----------------------------------------------------
function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="py-12 bg-gray-50 border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
              ﷽
            </div>
            <div>
              <div className="font-bold text-gray-900">Family Goal System</div>
              <div className="text-xs text-gray-500">
                Built on consistency, accountability &amp; Islamic values
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <button
              onClick={() => navigate('/login')}
              className="text-gray-600 hover:text-gray-900"
            >
              Parent Sign In
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="text-gray-600 hover:text-gray-900"
            >
              Sign Up
            </button>
            <button
              onClick={() => navigate('/kid-login-new')}
              className="text-gray-600 hover:text-gray-900"
            >
              Kid Login
            </button>
            <button
              onClick={() => navigate('/network-test')}
              className="text-gray-500 hover:text-gray-700 text-xs"
            >
              Network Diagnostics
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Family Goal System. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

// ---- Page ---------------------------------------------------------------
export function Welcome() {
  return (
    <div className="min-h-screen bg-white">
      <TopNav />
      <main>
        <Hero />
        <WhyFGS />
        <HowItWorks />
        <ForParents />
        <ForKids />
        <FeaturesGrid />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
