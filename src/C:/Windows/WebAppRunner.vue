<template>
  <div
    :class="$style.webAppRunner"
    class="no-border"
  >
    <iframe :src="iframeSrc" />
  </div>
</template>

<script>
import { rgba } from '@/styles/utils';
import { props } from '@/utils/vue';
import { fileObject, resolveFileByPath } from '@/services/fs';

const parseFileData = (file) => {
  try {
    return JSON.parse(file.data);
  } catch (_e) {
    return {};
  }
};
export default {
  canHandle: (file) => file && file.path.endsWith('.webapp'),
  metaData: (file) => {
    const parsedData = parseFileData(file);
    return {
      ...(parsedData.icon && {
        icon: resolveFileByPath(parsedData.icon) || fileObject('icon.png', 'file', parsedData.icon),
      }),
      width: parsedData.width || 600,
      height: parsedData.height || 500,
    };
  },
  ...props({
    file: props.obj(null),
  }),
  computed: {
    iframeSrc() {
      const config = parseFileData(this.file);
      return config.document
        ? `/api/office/open?path=${encodeURIComponent(config.document)}`
        : config.url;
    },
  },
  style({ className }) {
    return [
      className('webAppRunner', {
        '& > iframe': {
          background: rgba(255, 1),
          width: '100%',
          height: '100%',
        },
      }),
    ];
  },
};
</script>
