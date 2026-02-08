"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Tab = "overview" | "security" | "picture";

interface GenreData {
  genreName: string;
  count: number;
}

interface StatsData {
  completedCount: number;
  genreBreakdown: GenreData[];
}

interface SessionData {
  id: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

/* ------------------------------------------------------------------ */
/*  Genre colour palette                                               */
/* ------------------------------------------------------------------ */

const GENRE_COLORS: Record<string, string> = {
  Action: "#FF6B6B",
  Adventure: "#4ECDC4",
  Comedy: "#FFD93D",
  Drama: "#6C9BCF",
  Romance: "#FF85A2",
  Psychological: "#A855F7",
  Suspense: "#5B8DEF",
  Tragedy: "#94A3B8",
  Fantasy: "#C084FC",
  "Sci-Fi": "#22D3EE",
  Horror: "#EF4444",
  Mystery: "#8B5CF6",
  "Slice of Life": "#34D399",
  Sports: "#F97316",
  Supernatural: "#D946EF",
  Thriller: "#6366F1",
  Ecchi: "#FB7185",
  Music: "#FBBF24",
  Mecha: "#14B8A6",
};

const FALLBACK_COLORS = [
  "#F472B6",
  "#818CF8",
  "#34D399",
  "#FBBF24",
  "#FB923C",
  "#A78BFA",
  "#38BDF8",
  "#F87171",
];

function getGenreColor(name: string, idx: number): string {
  return GENRE_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

/* ------------------------------------------------------------------ */
/*  Donut chart                                                        */
/* ------------------------------------------------------------------ */

function DonutChart({
  data,
  completedCount,
}: {
  data: { name: string; count: number; color: string; percentage: number }[];
  completedCount: number;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 95;
  const innerR = 60;

  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={outerR} fill="#2A2440" />
        <circle cx={cx} cy={cy} r={innerR} fill="#0D0B14" />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#8B7FA0"
          fontSize="14"
        >
          No data
        </text>
      </svg>
    );
  }

  const polarToCartesian = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const segments = data.reduce<
    { name: string; count: number; color: string; percentage: number; startAngle: number; endAngle: number }[]
  >((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].endAngle : 0;
    const angle = (d.count / total) * 360;
    acc.push({ ...d, startAngle: prev, endAngle: prev + angle });
    return acc;
  }, []);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={outerR} fill="#2A2440" />

      {/* Segments */}
      {segments.map((seg, i) => {
        const span = seg.endAngle - seg.startAngle;
        if (span >= 359.99) {
          return (
            <circle key={i} cx={cx} cy={cy} r={outerR} fill={seg.color} />
          );
        }
        const p1 = polarToCartesian(seg.startAngle, outerR);
        const p2 = polarToCartesian(seg.endAngle, outerR);
        const largeArc = span > 180 ? 1 : 0;
        const d = [
          `M ${cx} ${cy}`,
          `L ${p1.x} ${p1.y}`,
          `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
          "Z",
        ].join(" ");
        return <path key={i} d={d} fill={seg.color} />;
      })}

      {/* Inner circle (donut hole) */}
      <circle cx={cx} cy={cy} r={innerR} fill="#0D0B14" />

      {/* Center text */}
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#E8E0F0"
        fontSize="28"
        fontWeight="bold"
      >
        {completedCount}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#8B7FA0"
        fontSize="11"
      >
        completed
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab button                                                         */
/* ------------------------------------------------------------------ */

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex md:w-full items-center gap-2 md:gap-3 rounded-lg px-3 md:px-4 py-2.5 md:py-3 text-left text-sm font-medium whitespace-nowrap transition-all ${
        active
          ? "bg-[#E064D6]/15 text-[#E064D6]"
          : "text-[#8B7FA0] hover:bg-[#1A1625] hover:text-[#C8BDD9]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons (inline SVGs)                                                */
/* ------------------------------------------------------------------ */

const OverviewIcon = (
  <svg
    className="h-5 w-5 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 13h2v8H3zM9 8h2v13H9zM15 11h2v10h-2zM21 4h2v17h-2z"
    />
  </svg>
);

const SecurityIcon = (
  <svg
    className="h-5 w-5 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const PictureIcon = (
  <svg
    className="h-5 w-5 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
    />
  </svg>
);

/* ================================================================== */
/*  Main component                                                     */
/* ================================================================== */

export default function UserPageContent({
  username,
  email,
  userPicture,
}: {
  username: string;
  email: string | null;
  userPicture: string | null;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  /* ---- Overview state ---- */
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  /* ---- Security state ---- */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  /* ---- Sessions state ---- */
  const [userSessions, setUserSessions] = useState<SessionData[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsFetched, setSessionsFetched] = useState(false);
  const [logoutEverywhereLoading, setLogoutEverywhereLoading] = useState(false);

  /* ---- Picture state ---- */
  const [pictureUrl, setPictureUrl] = useState(userPicture ?? "");
  const [currentPicture, setCurrentPicture] = useState(userPicture);
  const [picError, setPicError] = useState<string | null>(null);
  const [picSuccess, setPicSuccess] = useState(false);
  const [picLoading, setPicLoading] = useState(false);

  /* ---- Fetch stats on mount ---- */
  useEffect(() => {
    fetch("/api/user/stats")
      .then((r) => r.json())
      .then((d) => {
        setStats(d);
        setStatsLoading(false);
      })
      .catch(() => setStatsLoading(false));
  }, []);

  /* ---- Fetch sessions when security tab is opened ---- */
  useEffect(() => {
    if (activeTab !== "security" || sessionsFetched) return;
    setSessionsLoading(true);
    fetch("/api/user/sessions")
      .then((r) => r.json())
      .then((d: SessionData[]) => {
        setUserSessions(d);
        setSessionsFetched(true);
      })
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, [activeTab, sessionsFetched]);

  /* ---- Password validation ---- */
  const validatePassword = (pw: string): string | null => {
    if (pw.length < 12) return "Password must be at least 12 characters";
    if (!/[a-zA-Z]/.test(pw)) return "Password must contain at least one letter";
    if (!/\d/.test(pw)) return "Password must contain at least one number";
    return null;
  };

  const handlePasswordChange = async () => {
    setPwError(null);
    setPwSuccess(false);

    if (!currentPassword) {
      setPwError("Current password is required");
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setPwError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }

    setPwLoading(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || "Failed to update password");
      } else {
        setPwSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPwError("Network error. Please try again.");
    } finally {
      setPwLoading(false);
    }
  };

  /* ---- Log out everywhere ---- */
  const handleLogoutEverywhere = async () => {
    setLogoutEverywhereLoading(true);
    try {
      await fetch("/api/user/sessions", { method: "DELETE" });
      signOut({ callbackUrl: "/" });
    } catch {
      setLogoutEverywhereLoading(false);
    }
  };

  /* ---- Picture update ---- */
  const handlePictureUpdate = async () => {
    setPicError(null);
    setPicSuccess(false);

    if (!pictureUrl.trim()) {
      setPicError("Please enter a URL");
      return;
    }

    try {
      new URL(pictureUrl);
    } catch {
      setPicError("Invalid URL format");
      return;
    }

    setPicLoading(true);
    try {
      const res = await fetch("/api/user/picture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pictureUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPicError(data.error || "Failed to update picture");
      } else {
        setPicSuccess(true);
        setCurrentPicture(data.pictureUrl);
      }
    } catch {
      setPicError("Network error. Please try again.");
    } finally {
      setPicLoading(false);
    }
  };

  /* ---- Prepare chart data ---- */
  const chartData = (stats?.genreBreakdown ?? []).map((g, i) => {
    const totalGenre = (stats?.genreBreakdown ?? []).reduce(
      (s, d) => s + d.count,
      0
    );
    return {
      name: g.genreName,
      count: g.count,
      color: getGenreColor(g.genreName, i),
      percentage: totalGenre > 0 ? (g.count / totalGenre) * 100 : 0,
    };
  });

  /* ---- Password strength indicator ---- */
  const pwStrength = (() => {
    if (!newPassword) return { label: "", color: "", width: "0%" };
    const hasLength = newPassword.length >= 12;
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    const checks = [hasLength, hasLetter, hasNumber].filter(Boolean).length;
    if (checks === 3) return { label: "Strong", color: "#34D399", width: "100%" };
    if (checks === 2) return { label: "Medium", color: "#FBBF24", width: "66%" };
    return { label: "Weak", color: "#EF4444", width: "33%" };
  })();

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="min-h-screen bg-[#0D0B14] text-[#E8E0F0]">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-30 border-b border-[#2A2440] bg-[#13111C]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight transition-colors hover:text-[#E064D6]"
          >
            Kizuna
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-[#2A2440] px-3 py-1.5 text-sm text-[#8B7FA0] transition-colors hover:border-[#3D3560] hover:text-[#E8E0F0]"
            >
              Back to library
            </Link>
          </div>
        </div>
      </header>

      {/* ---- Body ---- */}
      <div className="mx-auto flex max-w-5xl flex-col md:flex-row gap-6 px-4 py-8">
        {/* ---- Sidebar ---- */}
        <aside className="w-full md:w-56 flex-shrink-0">
          {/* User info */}
          <div className="mb-4 md:mb-6 flex flex-row md:flex-col items-center gap-3 md:gap-0 rounded-xl border border-[#2A2440] bg-[#1A1625] p-4 md:p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPicture || "/user_picture.png"}
              alt={username}
              className="h-14 w-14 md:h-20 md:w-20 md:mb-3 rounded-full border-2 border-[#2A2440] object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/user_picture.png";
              }}
            />
            <div className="flex flex-col md:items-center">
              <p className="text-sm font-semibold">{username}</p>
              {email && (
                <p className="mt-0.5 text-xs text-[#8B7FA0]">{email}</p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto">
            <TabButton
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
              icon={OverviewIcon}
              label="Overview"
            />
            <TabButton
              active={activeTab === "security"}
              onClick={() => setActiveTab("security")}
              icon={SecurityIcon}
              label="Security"
            />
            <TabButton
              active={activeTab === "picture"}
              onClick={() => setActiveTab("picture")}
              icon={PictureIcon}
              label="Profile Picture"
            />
          </nav>
        </aside>

        {/* ---- Content ---- */}
        <main className="min-w-0 flex-1">
          {/* ============ OVERVIEW ============ */}
          {activeTab === "overview" && (
            <div>
              <h2 className="mb-6 text-xl font-bold">Overview</h2>

              {statsLoading ? (
                <div className="flex justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E064D6] border-t-transparent" />
                </div>
              ) : (
                <>
                  {/* Completed count card */}
                  <div className="mb-8 rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
                    <p className="mb-1 text-sm text-[#8B7FA0]">
                      Anime Completed
                    </p>
                    <p className="text-4xl font-bold text-[#E064D6]">
                      {stats?.completedCount ?? 0}
                    </p>
                  </div>

                  {/* Genre pie chart */}
                  <div className="rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
                    <h3 className="mb-5 text-base font-semibold">
                      Genre Distribution
                    </h3>

                    {chartData.length === 0 ? (
                      <p className="py-8 text-center text-sm text-[#8B7FA0]">
                        No genre data yet.
                      </p>
                    ) : (
                      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start">
                        <DonutChart
                          data={chartData}
                          completedCount={stats?.completedCount ?? 0}
                        />

                        {/* Legend */}
                        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                          {chartData.map((g, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2"
                            >
                              <span
                                className="inline-block h-3 w-3 flex-shrink-0 rounded-sm"
                                style={{ backgroundColor: g.color }}
                              />
                              <span className="text-sm text-[#C8BDD9]">
                                {g.name}
                              </span>
                              <span className="ml-auto text-sm font-medium tabular-nums">
                                {g.percentage.toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ============ SECURITY ============ */}
          {activeTab === "security" && (
            <div>
              <h2 className="mb-6 text-xl font-bold">Security Settings</h2>

              <div className="rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
                <h3 className="mb-4 text-base font-semibold">
                  Change Password
                </h3>

                {/* Current password */}
                <div className="mb-4">
                  <label
                    htmlFor="current-password"
                    className="mb-1.5 block text-sm text-[#8B7FA0]"
                  >
                    Current password
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      setPwError(null);
                      setPwSuccess(false);
                    }}
                    placeholder="Enter your current password"
                    className="w-full rounded-lg border border-[#2A2440] bg-[#13111C] px-4 py-2.5 text-sm text-[#E8E0F0] placeholder-[#6B6080] outline-none transition-colors focus:border-[#E064D6]"
                  />
                </div>

                {/* New password */}
                <div className="mb-4">
                  <label
                    htmlFor="new-password"
                    className="mb-1.5 block text-sm text-[#8B7FA0]"
                  >
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPwError(null);
                      setPwSuccess(false);
                    }}
                    placeholder="At least 12 characters, letters + numbers"
                    className="w-full rounded-lg border border-[#2A2440] bg-[#13111C] px-4 py-2.5 text-sm text-[#E8E0F0] placeholder-[#6B6080] outline-none transition-colors focus:border-[#E064D6]"
                  />
                </div>

                {/* Password strength bar */}
                {newPassword && (
                  <div className="mb-4">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-[#8B7FA0]">Strength</span>
                      <span
                        className="text-xs font-medium"
                        style={{ color: pwStrength.color }}
                      >
                        {pwStrength.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2A2440]">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: pwStrength.width,
                          backgroundColor: pwStrength.color,
                        }}
                      />
                    </div>
                    <div className="mt-2 space-y-0.5 text-xs text-[#8B7FA0]">
                      <p
                        className={
                          newPassword.length >= 12
                            ? "text-[#34D399]"
                            : ""
                        }
                      >
                        {newPassword.length >= 12 ? "\u2713" : "\u2717"} At
                        least 12 characters
                      </p>
                      <p
                        className={
                          /[a-zA-Z]/.test(newPassword)
                            ? "text-[#34D399]"
                            : ""
                        }
                      >
                        {/[a-zA-Z]/.test(newPassword) ? "\u2713" : "\u2717"}{" "}
                        Contains a letter
                      </p>
                      <p
                        className={
                          /\d/.test(newPassword) ? "text-[#34D399]" : ""
                        }
                      >
                        {/\d/.test(newPassword) ? "\u2713" : "\u2717"} Contains
                        a number
                      </p>
                    </div>
                  </div>
                )}

                {/* Confirm password */}
                <div className="mb-5">
                  <label
                    htmlFor="confirm-password"
                    className="mb-1.5 block text-sm text-[#8B7FA0]"
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setPwError(null);
                      setPwSuccess(false);
                    }}
                    placeholder="Re-enter your new password"
                    className="w-full rounded-lg border border-[#2A2440] bg-[#13111C] px-4 py-2.5 text-sm text-[#E8E0F0] placeholder-[#6B6080] outline-none transition-colors focus:border-[#E064D6]"
                  />
                  {confirmPassword &&
                    newPassword !== confirmPassword && (
                      <p className="mt-1 text-xs text-[#EF4444]">
                        Passwords do not match
                      </p>
                    )}
                </div>

                {/* Error / Success */}
                {pwError && (
                  <div className="mb-4 rounded-lg border border-[#5A2832] bg-[#3A1820]/40 px-4 py-2.5 text-sm text-[#E06B7A]">
                    {pwError}
                  </div>
                )}
                {pwSuccess && (
                  <div className="mb-4 rounded-lg border border-[#1D5E3A] bg-[#143026]/40 px-4 py-2.5 text-sm text-[#34D399]">
                    Password updated successfully!
                  </div>
                )}

                {/* Submit */}
                <button
                  type="button"
                  onClick={handlePasswordChange}
                  disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
                  className="rounded-lg bg-[#E064D6] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#C850C0] hover:shadow-[0_0_16px_rgba(224,100,214,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pwLoading ? "Updating…" : "Update Password"}
                </button>
              </div>

              {/* ---- Active Sessions ---- */}
              <div className="mt-8 rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
                <h3 className="mb-1 text-base font-semibold">
                  Active Sessions
                </h3>
                <p className="mb-4 text-sm text-[#8B7FA0]">
                  Devices currently signed in with your account.
                </p>

                {sessionsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#E064D6] border-t-transparent" />
                  </div>
                ) : userSessions.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[#8B7FA0]">
                    No active sessions found.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {userSessions.map((s) => (
                      <div
                        key={s.id}
                        className={`rounded-lg border px-4 py-3 ${
                          s.isCurrent
                            ? "border-[#E064D6]/40 bg-[#E064D6]/5"
                            : "border-[#2A2440] bg-[#13111C]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {/* Device icon */}
                          <svg
                            className="h-4 w-4 flex-shrink-0 text-[#8B7FA0]"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z"
                            />
                          </svg>
                          <span className="text-sm font-medium text-[#E8E0F0]">
                            Session
                          </span>
                          {s.isCurrent && (
                            <span className="rounded-full bg-[#E064D6]/20 px-2 py-0.5 text-[10px] font-semibold text-[#E064D6]">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#8B7FA0]">
                          <span>
                            Created:{" "}
                            <span className="text-[#C8BDD9]">
                              {new Date(s.createdAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </span>
                          </span>
                          <span>
                            Expires:{" "}
                            <span className="text-[#C8BDD9]">
                              {new Date(s.expiresAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ---- Log out everywhere ---- */}
              <div className="mt-8 rounded-xl border border-[#3A1820] bg-[#1A1625] p-6">
                <h3 className="mb-2 text-base font-semibold text-[#E06B7A]">
                  Sign Out Everywhere
                </h3>
                <p className="mb-4 text-sm text-[#8B7FA0]">
                  Revoke all active sessions and sign out from every device,
                  including this one.
                </p>
                <button
                  type="button"
                  onClick={handleLogoutEverywhere}
                  disabled={logoutEverywhereLoading}
                  className="w-full rounded-lg border border-[#5A2832] bg-[#3A1820] py-3 text-sm font-semibold text-[#E06B7A] transition-all hover:bg-[#4A2030] hover:text-[#FF8A9A] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {logoutEverywhereLoading
                    ? "Signing out…"
                    : "Log Out Everywhere"}
                </button>
              </div>
            </div>
          )}

          {/* ============ PROFILE PICTURE ============ */}
          {activeTab === "picture" && (
            <div>
              <h2 className="mb-6 text-xl font-bold">Profile Picture</h2>

              <div className="rounded-xl border border-[#2A2440] bg-[#1A1625] p-6">
                {/* Current picture preview */}
                <div className="mb-6 flex flex-col items-center">
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentPicture || "/user_picture.png"}
                      alt="Profile"
                      className="h-32 w-32 rounded-full border-4 border-[#2A2440] object-cover shadow-[0_0_24px_rgba(224,100,214,0.15)]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "/user_picture.png";
                      }}
                    />
                    {!currentPicture && (
                      <span className="absolute bottom-1 right-1 rounded-full bg-[#2A2440] px-2 py-0.5 text-[10px] text-[#8B7FA0]">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-[#8B7FA0]">
                    {currentPicture
                      ? "Your current profile picture"
                      : "Using default profile picture"}
                  </p>
                </div>

                {/* URL input */}
                <div className="mb-4">
                  <label
                    htmlFor="picture-url"
                    className="mb-1.5 block text-sm text-[#8B7FA0]"
                  >
                    Image URL
                  </label>
                  <input
                    id="picture-url"
                    type="url"
                    value={pictureUrl}
                    onChange={(e) => {
                      setPictureUrl(e.target.value);
                      setPicError(null);
                      setPicSuccess(false);
                    }}
                    placeholder="https://example.com/my-photo.jpg"
                    className="w-full rounded-lg border border-[#2A2440] bg-[#13111C] px-4 py-2.5 text-sm text-[#E8E0F0] placeholder-[#6B6080] outline-none transition-colors focus:border-[#E064D6]"
                  />
                </div>

                {/* Preview */}
                {pictureUrl && pictureUrl !== currentPicture && (
                  <div className="mb-4 flex items-center gap-4">
                    <p className="text-sm text-[#8B7FA0]">Preview:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pictureUrl}
                      alt="Preview"
                      className="h-16 w-16 rounded-full border-2 border-[#2A2440] object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}

                {/* Error / Success */}
                {picError && (
                  <div className="mb-4 rounded-lg border border-[#5A2832] bg-[#3A1820]/40 px-4 py-2.5 text-sm text-[#E06B7A]">
                    {picError}
                  </div>
                )}
                {picSuccess && (
                  <div className="mb-4 rounded-lg border border-[#1D5E3A] bg-[#143026]/40 px-4 py-2.5 text-sm text-[#34D399]">
                    Profile picture updated!
                  </div>
                )}

                {/* Submit */}
                <button
                  type="button"
                  onClick={handlePictureUpdate}
                  disabled={picLoading || !pictureUrl.trim()}
                  className="rounded-lg bg-[#E064D6] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#C850C0] hover:shadow-[0_0_16px_rgba(224,100,214,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {picLoading ? "Saving…" : "Save Picture"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
