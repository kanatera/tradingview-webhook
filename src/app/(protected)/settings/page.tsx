"use client";

import { useState, useCallback } from "react";
import SpeakerDiscovery from "@/components/settings/SpeakerDiscovery";
import ScheduleManager from "@/components/settings/ScheduleManager";
import LgTvManager from "@/components/settings/LgTvManager";
import DatabaseTools from "@/components/settings/DatabaseTools";
import CredentialsForm from "@/components/settings/CredentialsForm";
import QuietHoursManager from "@/components/settings/QuietHoursManager";
import ApiTokenManager from "@/components/settings/ApiTokenManager";

export default function SettingsPage() {
    const [refreshKey, setRefreshKey] = useState(0);
    const onRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Configure output channels and manage your database
                </p>
            </div>

            {/* LG TV Section */}
            <section className="space-y-4">
                <LgTvManager key={refreshKey} onRefresh={onRefresh} />
            </section>

            <hr className="border-warm-200" />

            {/* Google Home / Chromecast Section */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Google Home / Chromecast Speakers</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Used as fallback when TV is off or TV schedule is inactive.</p>
                </div>

                {/* Speaker Discovery + Add */}
                <SpeakerDiscovery onRefresh={onRefresh} />

                {/* Speaker Schedule Cards */}
                <ScheduleManager key={refreshKey} />
            </section>

            <hr className="border-warm-200" />

            {/* Quiet Hours / Do Not Disturb */}
            <section className="space-y-4">
                <QuietHoursManager />
            </section>

            <hr className="border-warm-200" />

            {/* Database Maintenance */}
            <DatabaseTools />

            {/* System Settings */}
            <CredentialsForm />

            {/* Read-only API token for external dashboards */}
            <ApiTokenManager />
        </div>
    );
}
