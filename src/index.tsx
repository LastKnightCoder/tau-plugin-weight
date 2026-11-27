import { Scale } from "lucide-react";
import { SIDEBAR_GROUPS, definePlugin, type PluginPageProps, type PluginSettingsProps } from "@tau/plugins";
import { registerCollections } from "./data/store";
import { messages } from "./i18n";
import { createRuntime, RuntimeProvider } from "./runtime";
import { HomePanel } from "./ui/HomePanel";
import { MobileHomePanel } from "./ui/mobile/MobileHomePanel";
import { MobileWeightPage } from "./ui/mobile/MobileWeightPage";
import { SettingsForm } from "./ui/SettingsForm";
import { WeightPage } from "./ui/WeightPage";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  i18n: messages,
  create: () => ({
    activate(context) {
      registerCollections(context);
      const runtime = createRuntime(context);
      // 手机另有一套为触控设计的界面；数据、统计口径与 AI 两端共用
      const mobile = context.environment.platform === "android" || context.environment.platform === "ios";
      const Page = mobile ? MobileWeightPage : WeightPage;
      const page = context.pages.register({
        id: "weight",
        title: messages.ref("app.page.title"),
        component: (props: PluginPageProps) => (
          <RuntimeProvider runtime={runtime}>
            <Page {...props} />
          </RuntimeProvider>
        ),
      });
      runtime.pages.main = page;
      // 手机的「趋势与效果」二级页
      if (mobile)
        runtime.pages.trend = context.pages.register({
          id: "trend",
          title: messages.ref("app.page.trend"),
          component: (props: PluginPageProps) => (
            <RuntimeProvider runtime={runtime}>
              <MobileWeightPage {...props} params={{ ...props.params, view: "trend" }} />
            </RuntimeProvider>
          ),
        });
      if (mobile)
        context.navigation.registerEntry({ id: "weight", title: messages.ref("app.page.title"), icon: Scale, page });
      else
        context.sidebar.registerItem({
          id: "weight",
          title: messages.ref("app.page.title"),
          icon: Scale,
          group: SIDEBAR_GROUPS.daily,
          page,
        });
      runtime.pages.settings = context.settings.register({
        id: "profile",
        title: messages.ref("app.settings.title"),
        description: messages.ref("app.settings.description"),
        component: (props: PluginSettingsProps) => (
          <RuntimeProvider runtime={runtime}>
            <SettingsForm {...props} />
          </RuntimeProvider>
        ),
      });
      context.home.registerPanel({
        id: "today",
        title: messages.ref("app.page.title"),
        size: "compact",
        action: { title: messages.ref(mobile ? "app.home.action.viewMobile" : "app.home.action.view"), run: () => page.open() },
        component: props => (
          <RuntimeProvider runtime={runtime}>
            {mobile ? <MobileHomePanel {...props} /> : <HomePanel />}
          </RuntimeProvider>
        ),
      });
      context.commands.register({
        id: "weigh",
        title: messages.ref("app.command.weigh"),
        run: async () => {
          await page.open({ weigh: "auto" });
          return null;
        },
      });
    },
  }),
});
