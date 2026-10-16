<template>
  <div
    :class="$style.officeViewer"
    class="no-border"
  >
    <iframe
      :src="iframeSrc"
      title="Visionneuse de documents"
    />
  </div>
</template>

<script>
import { props } from '@/utils/vue';
import { resolveFileByPath } from '@/services/fs';
import { isOfficeDocument } from '../../../shared/office.mjs';

export default {
  canHandle: (file) => file && isOfficeDocument(file.path),
  metaData: (file) => ({
    icon: resolveFileByPath('C:/Windows/system/icons/docx.png'),
    width: 1000,
    height: 750,
    title: file ? file.path.split('/').pop() : 'Documents',
  }),
  ...props({ file: props.obj(null) }),
  computed: {
    iframeSrc() {
      return `/api/office/open?path=${encodeURIComponent(this.file.data)}`;
    },
  },
  style({ className }) {
    return [className('officeViewer', {
      '& > iframe': {
        width: '100%', height: '100%', border: 0, background: '#fff',
      },
    })];
  },
};
</script>
