// The views render their cards through vuedraggable; this stub renders the
// item slot once per element so a real card is in the tree.
export const draggableStub = {
  props: ['modelValue'],
  template:
    '<div><template v-for="element in modelValue" :key="element.id"><slot name="item" :element="element" /></template></div>'
}
