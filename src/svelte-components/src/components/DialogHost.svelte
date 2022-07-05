<script lang="ts">
  import HomeMachineDialog from "../dialogs/HomeMachineDialog.svelte";
  import { HomeMachine } from "../lib/DialogProps";
</script>

<HomeMachineDialog {...$HomeMachine} />
