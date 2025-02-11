const { Liquid } = require('liquidjs');

/**
 Macro: liveDemo::<demo>[]
 such as:

 ```
 liveDemo::classic[]
 ```

 Makes an embedded editor example with tabs, including an "Edit on CodePen" tab.

 params:

 id (required). Picks folder for files, and used in css classes.
 type (optional) - Specifies if the example is `tinymce` or `tinydrive` specific default is `tinymce`
 tab (optional - default to "run"), "run", "html", "css" or "js". The first tab to open.
 height (optional - no default). min-height in pixels.
 script_url_override (optional - no default).
 - Override the full tinymce.min.js URL, including api key.
 - Useful for testing things that aren't in the main channel, yet.
 - Remove this setting once the feature is in the main channel.

 Files required under live-demos/id/

 index.html
 index.js
 index.css optional file
 example.js optional file
 example.html optional file

 if index.css is omitted, the css tab will not display

 example.js purpose:
 when the file is present the live-demo js tab will display the contents of example.js, while the real demo code executes with index.js
 Useful for when we want to hide actual api-keys or tokens: 'example-token'.
 When the example.js file is present, the link to the external codepen site is disabled
 */

const templateCache = {};

const validContent = {
  html: 'index.html',
  js: 'index.js',
  examplejs: 'example.js',
  examplehtml: 'example.html',
  css: 'style.css'
};

const defaultTabs = [
  {
    name: 'run',
  },
  {
    name: 'html',
    text: 'HTML'
  },
  {
    name: 'css',
    text: 'CSS'
  },
  {
    name: 'js',
    text: 'JS'
  }
];

const loadDemoResource = (catalog, ctx, filePath) => {
  const demoCss = catalog.resolveResource(`live-demos/${filePath}`, ctx, 'example', [ 'example' ]);
  return demoCss ? demoCss.contents.toString() : undefined;
};

const loadTemplate = (engine, catalog, ctx, filePath) => {
  const key = `${ctx.component}/${ctx.version}/modules/${ctx.module}/examples/${filePath}`;
  if (templateCache.hasOwnProperty(key)) {
    return templateCache[key];
  } else {
    const file = loadDemoResource(catalog, ctx, filePath);
    const template = file !== undefined ? engine.parse(file, key) : undefined;
    templateCache[key] = template;
    return template;
  }
};

const getDemoTitle = (type) => {
  switch (type) {
    case 'tinydrive':
      return 'Tiny Drive';
    case 'tinymce':
    default:
      return 'TinyMCE'
  }
};

const getScript = (type, docAttrs) => {
  switch (type) {
    case 'tinydrive':
      return docAttrs['tinydrive_live_demo_url'];
    case 'tinymce':
    default:
      return docAttrs['tinymce_live_demo_url'];
  }
};

const getDemoCss = (catalog, type, ctx) => {
  if (type === 'tinydrive') {
    return loadDemoResource(catalog, ctx, 'tinydrive.css');
  } else {
    return '';
  }
};

const getTabs = (type, contentData) => {
  const tabs = defaultTabs.filter((d) => {
    return d.name === 'run' || contentData.hasOwnProperty(d.name);
  }).map((d) => ({
    ...d,
    text: d.name === 'run' ? getDemoTitle(type) : d.text
  }));

  if (!contentData.hasExamplejs) {
    tabs.push({
      name: 'codepen',
      text: 'Edit on CodePen'
    })
  }

  return tabs;
};

const loadContent = (engine, catalog, id, docAttrs) => {
  const data = {};
  const ctx = {
    module: docAttrs['page-module'],
    component: docAttrs['page-component-name'],
    version: docAttrs['page-component-version'],
  };

  Object.entries(validContent).forEach(([type, file]) => {
    const hasKey = 'has' + type[0].toUpperCase() + type.slice(1);

    // If the template file exists then render the content
    const template = loadTemplate(engine, catalog, ctx, `${id}/${file}`);
    if (template !== undefined) {
      data[type] = engine.renderSync(template, {
        baseurl: `${docAttrs['site-url']}/${ctx.component}/${ctx.version}`,
        ...docAttrs
      });
      data[hasKey] = true;
    } else {
      data[hasKey] = false;
    }
  });

  if (!data.hasOwnProperty('examplejs')) {
    data['examplejs'] = data['js'];
  }

  if (!data.hasOwnProperty('examplehtml')) {
    data['examplehtml'] = data['html'];
  }

  return data;
};

module.exports.register = (registry, context) => {
  const catalog = context.contentCatalog;

  registry.blockMacro(function() {
    const engine = new Liquid();
    engine.registerFilter('uri_escape', (url) => encodeURIComponent(url));
    const scriptsLoaded = {};

    const self = this;
    this.named('liveDemo');
    this.process((parent, target, attrs) => {
      // Get the data to pass to the template
      const docAttrs = parent.document.getAttributes();
      const type = attrs.type || 'tinymce';
      const contentData = loadContent(engine, catalog, target, docAttrs);
      const initialTab = attrs.tab || 'run';
      const scriptUrl = attrs.script_url_override || getScript(type, docAttrs);

      // Render the template
      const rootCtx = {
        module: 'ROOT',
        component: docAttrs['page-component-name'],
        version: docAttrs['page-component-version'],
      };
      const template = loadTemplate(engine, catalog, rootCtx, 'live-demo.adoc.liquid');
      const renderedContent = engine.renderSync(template, {
        liveDemo: {
          ...attrs,
          type: type,
          css: getDemoCss(catalog, type, rootCtx),
          id: target,
          content: contentData,
          initialTab: initialTab,
          script: {
            include: scriptsLoaded[scriptUrl] !== true,
            url: scriptUrl,
          },
          tabs: getTabs(type, contentData)
        }
      });
      scriptsLoaded[scriptUrl] = true;

      // Parse the content using AsciiDoctor
      const wrapper = self.createBlock(parent, 'open', [], {});
      self.parseContent(wrapper, renderedContent);
      return wrapper;
    })
  })
};