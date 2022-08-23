<script lang="ts">
  import * as api from "$lib/api";
</script>

<div class="devmode">
  <button on:click={() => api.PUT("devmode/probe")}> Probe Contact </button>
</div>

<style lang="scss">
  .devmode {
    background-color: greenyellow;
    z-index: 20000000;
    position: absolute;
    top: 10px;
    left: 400px;
    width: 500px;
    height: 100px;
    padding: 6px;
    display: flex;
    align-items: flex-start;
    justify-items: space-between;
  }
</style>
