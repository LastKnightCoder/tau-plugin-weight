import { Scale } from "lucide-react";
import { SIDEBAR_GROUPS, definePlugin, type PluginPageProps, type PluginSettingsProps } from "@tau/plugins";
import { registerCollections } from "./data/store";
import { createRuntime, RuntimeProvider } from "./runtime";
import { HomePanel } from "./ui/HomePanel";
import { SettingsForm } from "./ui/SettingsForm";
import { WeightPage } from "./ui/WeightPage";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      registerCollections(context);
      const runtime = createRuntime(context);
      const page = context.pages.register({
        id: "weight",
        title: "减重",
        component: (props: PluginPageProps) => (
          <RuntimeProvider runtime={runtime}>
            <WeightPage {...props} />
          </RuntimeProvider>
        ),
      });
      runtime.pages.main = page;
      context.sidebar.registerItem({
        id: "weight",
        title: "减重",
        icon: Scale,
        group: SIDEBAR_GROUPS.daily,
        page,
      });
      runtime.pages.settings = context.settings.register({
        id: "profile",
        title: "身体数据与目标",
        description: "用来计算每天的热量预算",
        component: (props: PluginSettingsProps) => (
          <RuntimeProvider runtime={runtime}>
            <SettingsForm {...props} />
          </RuntimeProvider>
        ),
      });
      context.home.registerPanel({
        id: "today",
        title: "减重",
        size: "compact",
        component: () => (
          <RuntimeProvider runtime={runtime}>
            <HomePanel />
          </RuntimeProvider>
        ),
      });
      context.commands.register({
        id: "weigh",
        title: "减重：记录体重",
        run: async () => {
          await page.open({ weigh: new Date().getHours() < 14 ? "am" : "pm" });
          return null;
        },
      });
    },
  }),
});
