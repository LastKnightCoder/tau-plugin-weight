import { Scale } from "lucide-react";
import { SIDEBAR_GROUPS, definePlugin, type PluginPageProps, type PluginSettingsProps } from "@tau/plugins";
import { registerCollections } from "./data/store";
import { createRuntime, RuntimeProvider } from "./runtime";
import { HomePanel } from "./ui/HomePanel";
import { MobileHomePanel } from "./ui/mobile/MobileHomePanel";
import { MobileWeightPage } from "./ui/mobile/MobileWeightPage";
import { SettingsForm } from "./ui/SettingsForm";
import { WeightPage } from "./ui/WeightPage";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      registerCollections(context);
      const runtime = createRuntime(context);
      // 手机另有一套为触控设计的界面；数据、统计口径与 AI 两端共用
      const mobile = context.environment.platform === "android" || context.environment.platform === "ios";
      const Page = mobile ? MobileWeightPage : WeightPage;
      const page = context.pages.register({
        id: "weight",
        title: "减重",
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
          title: "趋势与效果",
          component: (props: PluginPageProps) => (
            <RuntimeProvider runtime={runtime}>
              <MobileWeightPage {...props} params={{ ...props.params, view: "trend" }} />
            </RuntimeProvider>
          ),
        });
      if (mobile)
        context.navigation.registerEntry({ id: "weight", title: "减重", icon: Scale, page });
      else
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
        action: { title: mobile ? "查看" : "查看趋势", run: () => page.open() },
        component: props => (
          <RuntimeProvider runtime={runtime}>
            {mobile ? <MobileHomePanel {...props} /> : <HomePanel />}
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
